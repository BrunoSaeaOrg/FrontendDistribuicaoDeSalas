import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { finalize, forkJoin } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { fundirSalasEApi } from '../mock/ocupacao-adapter';
import { Sala, StatusInfo, StatusOcupacao, Turno, TurmaEmOutraSala, TurmaLivre, Unidade } from '../models';
import { OcupacaoApiService } from './ocupacao-api.service';
import { RegrasService } from './regras.service';
import { ToastService } from './toast.service';

const ANO_LETIVO = '2026';

/** Se o RM passou do tempo de espera do backend, recarrega depois deste intervalo. */
const RECARGA_APOS_GRAVACAO_PENDENTE_MS = 8000;

@Injectable({ providedIn: 'root' })
export class SalasService {
  private readonly ocupacaoApi = inject(OcupacaoApiService);
  private readonly authService = inject(AuthService);

  private readonly _unidades = signal<Unidade[]>([]);
  private readonly _salas = signal<Sala[]>([]);
  private readonly _turmasLivres = signal<TurmaLivre[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  /**
   * Célula (sala e turno) cujo vínculo turma x sala está sendo gravado (o RM leva alguns segundos):
   * a tela mostra o spinner nela. null quando nada está gravando.
   */
  private readonly _gravando = signal<{ salaId: string; turno: Turno } | null>(null);
  /** Usuario cuja carga ja foi disparada, evita refetch a cada reavaliacao do effect. */
  private usuarioCarregado: string | null = null;

  readonly unidades = this._unidades.asReadonly();
  readonly salas = this._salas.asReadonly();
  readonly turmasLivres = this._turmasLivres.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly gravando = this._gravando.asReadonly();
  /** Alguma gravação em andamento: trava vincular/liberar nas outras células também. */
  readonly salvando = computed(() => this._gravando() !== null);

  /** Ano letivo das turmas carregadas (parâmetro ANO de OC_SAL_TURMASXSALAS e OC_SAL_TURMAS). */
  readonly anoLetivo = ANO_LETIVO;

  /** Segmentos existentes nos dados (campo SEGMENTO da API), ordenados. */
  readonly segmentos = computed(() => {
    const set = new Set<string>();
    this._salas().forEach((s) =>
      (['manha', 'tarde'] as Turno[]).forEach((t) => {
        const turma = s.turnos[t];
        if (turma?.segmento) set.add(turma.segmento);
      }),
    );
    this._turmasLivres().forEach((t) => {
      if (t.segmento) set.add(t.segmento);
    });
    return Array.from(set).sort();
  });

  /** Séries existentes, derivadas do nome das turmas. */
  readonly series = computed(() => {
    const set = new Set<string>();
    this._salas().forEach((s) =>
      (['manha', 'tarde'] as Turno[]).forEach((t) => {
        const turma = s.turnos[t];
        if (turma) set.add(this.serieFromNome(turma.nome));
      }),
    );
    this._turmasLivres().forEach((t) => set.add(this.serieFromNome(t.nome)));
    return Array.from(set).sort();
  });

  /** Filiais distintas (uma unidade pode ter várias, ex: CASJ = 2, 13 e 16). */
  readonly filiais = computed(() => {
    const mapa = new Map<number, { codFilial: number; unidadeNome: string; salas: number }>();
    this._salas().forEach((s) => {
      const atual = mapa.get(s.codFilial);
      if (atual) {
        atual.salas++;
        return;
      }
      mapa.set(s.codFilial, {
        codFilial: s.codFilial,
        unidadeNome: this.unidade(s.unidadeId)?.nome ?? s.unidadeId,
        salas: 1,
      });
    });
    return Array.from(mapa.values()).sort((a, b) => a.codFilial - b.codFilial);
  });

  readonly totalSalas = computed(() => this._salas().length);
  readonly totalCarteiras = computed(() => this._salas().reduce((a, s) => a + s.carteiras, 0));
  readonly totalCapacidade = computed(() =>
    this._salas().reduce((a, s) => a + this.capacidade(s), 0),
  );
  readonly totalVagas = computed(() =>
    this._salas().reduce((a, s) => {
      const ocupacao = Math.max(this.alunosNoTurno(s, 'manha'), this.alunosNoTurno(s, 'tarde'));
      return a + Math.max(0, s.carteiras - ocupacao);
    }, 0),
  );

  constructor(
    private readonly regrasService: RegrasService,
    private readonly toast: ToastService,
  ) {
    // A carga depende da sessao: sem usuario o TOTVS recebe CODUSUARIO vazio e nao
    // retorna nada. O effect dispara assim que o login popula currentUser().
    effect(() => {
      const usuario = this.authService.currentUser()?.username;
      if (!usuario) {
        // Logout: descarta os dados para o proximo login nao herdar o estado anterior.
        this.usuarioCarregado = null;
        this._unidades.set([]);
        this._salas.set([]);
        this._turmasLivres.set([]);
        return;
      }
      if (usuario === this.usuarioCarregado) return;
      this.usuarioCarregado = usuario;
      this.carregar();
    });
  }

  /** Recarrega salas, vinculos e turmas livres do usuario autenticado. */
  carregar(): void {
    const codUsuario = this.authService.currentUser()?.username ?? '';
    if (!codUsuario) return;
    this._loading.set(true);
    this._error.set(null);

    forkJoin([
      this.ocupacaoApi.getSalas(codUsuario),
      this.ocupacaoApi.getTurmasXSalas(codUsuario, ANO_LETIVO),
      this.ocupacaoApi.getTurmas(codUsuario, ANO_LETIVO),
    ]).subscribe({
      next: ([salasDto, turmasXSalasDto, turmasDto]) => {
        const { unidades, salas, turmasLivres } = fundirSalasEApi(salasDto, turmasXSalasDto, turmasDto);
        this._unidades.set(unidades);
        this._salas.set(salas);
        this._turmasLivres.set(turmasLivres);
        this._loading.set(false);
      },
      error: (err) => {
        this._error.set('Não foi possível carregar as salas.');
        this._loading.set(false);
        this.toast.danger('Falha ao carregar salas','Não foi possível contatar o servidor.');
      },
    });
  }

  unidade(id: string): Unidade | undefined {
    return this._unidades().find((u) => u.id === id);
  }

  sala(id: string): Sala | undefined {
    return this._salas().find((s) => s.id === id);
  }

  /** Localiza uma sala pelas chaves TOTVS (usado para resolver nome/unidade em Solicitações). */
  salaPorChave(codFilial: number, codBloco: string, codPredio: string, codSala: string): Sala | undefined {
    return this._salas().find(
      (s) =>
        s.codFilial === codFilial &&
        s.codBloco === codBloco &&
        s.codPredio === codPredio &&
        s.codSala === codSala,
    );
  }

  salasDaUnidade(unidadeId: string): Sala[] {
    return this._salas().filter((s) => s.unidadeId === unidadeId);
  }

  turmasLivresPara(sala: Sala, turno: Turno): TurmaLivre[] {
    return this._turmasLivres().filter((t) => t.codFilial === sala.codFilial && t.turno === turno);
  }

  /**
   * Turmas do mesmo turno que estão em outras salas da mesma filial. Vincular uma delas aqui
   * move a turma: o vínculo é da turma, então gravar a sala nova substitui a antiga.
   */
  turmasEmOutraSalaPara(sala: Sala, turno: Turno): TurmaEmOutraSala[] {
    return this._salas()
      .filter((s) => s.id !== sala.id && s.codFilial === sala.codFilial && !!s.turnos[turno])
      .map((s) => {
        const t = s.turnos[turno]!;
        return { codTurma: t.codTurma, idPerlet: t.idPerlet, nome: t.nome, alunos: t.alunos, salaAtual: s.nome };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  capacidade(sala: Sala): number {
    return sala.capacidade;
  }

  alunosNoTurno(sala: Sala, turno: Turno): number {
    return sala.turnos[turno]?.alunos ?? 0;
  }

  /** Status a partir da ocupacao (maior turno) sobre uma capacidade de referencia. */
  private statusPorCapacidade(sala: Sala, cap: number): StatusInfo {
    const maiorOcupacao = Math.max(0, ...(['manha', 'tarde'] as Turno[]).map((t) => this.alunosNoTurno(sala, t)));
    const ratio = cap > 0 ? maiorOcupacao / cap : 0;
    const limite = (this.regrasService.regras().pctMaximoUtilizacao ?? 90) / 100;
    if (ratio > 1) return { label: 'Excedida', tone: 'danger', key: 'excedida' as StatusOcupacao };
    if (ratio >= limite) return { label: 'Quase lotada', tone: 'warning', key: 'quase' as StatusOcupacao };
    return { label: 'Disponível', tone: 'success', key: 'disponivel' as StatusOcupacao };
  }

  /** Status conforme a capacidade normativa (CAPACIDADE) — usado em Solicitacoes, Painel e Ocupacao. */
  statusInfo(sala: Sala): StatusInfo {
    return this.statusPorCapacidade(sala, this.capacidade(sala));
  }

  /** Status conforme as carteiras fisicas (CARTEIRAS) — usado na tela Planta (drag-and-drop). */
  statusInfoCarteiras(sala: Sala): StatusInfo {
    return this.statusPorCapacidade(sala, sala.carteiras);
  }

  /**
   * Deriva a série do nome da turma — a API não expõe esse campo separadamente.
   * "1º ano A - Manhã" → "1º ano"; "Infantil 2 A - Tarde" → "Infantil 2".
   */
  serieFromNome(nome: string): string {
    return nome
      .replace(/\s*-\s*(manh[ãa]|tarde|noite)\s*$/i, '')
      .replace(/\s+[A-Z]$/, '')
      .trim();
  }

  /**
   * Vincula a turma à sala, persistindo via OC_SAL_TURMASXSALAS_SALVAR. Com `salaAnterior`, a
   * turma estava em outra sala e está sendo movida (a mensagem de sucesso diz de onde saiu).
   */
  vincularTurno(
    sala: Sala,
    turno: Turno,
    turma: Pick<TurmaLivre, 'codTurma' | 'idPerlet' | 'nome'>,
    salaAnterior?: string,
  ): void {
    this.gravarVinculo(
      { salaId: sala.id, turno },
      {
        codFilial: sala.codFilial,
        codTurma: turma.codTurma,
        idPerlet: turma.idPerlet,
        codBloco: sala.codBloco,
        codPredio: sala.codPredio,
        codSala: sala.codSala,
      },
      salaAnterior
        ? ['Turma movida', `${turma.nome} saiu de ${salaAnterior} e foi para ${sala.nome}.`]
        : ['Turma vinculada', `${turma.nome} vinculada a ${sala.nome}.`],
      'Falha ao vincular turma',
    );
  }

  /** Remove o vínculo turma-sala enviando OC_SAL_TURMASXSALAS_SALVAR com sala vazia. */
  liberarTurno(sala: Sala, turno: Turno): void {
    const turma = sala.turnos[turno];
    if (!turma) return;
    this.gravarVinculo(
      { salaId: sala.id, turno },
      {
        codFilial: sala.codFilial,
        codTurma: turma.codTurma,
        idPerlet: turma.idPerlet,
        codBloco: '',
        codPredio: '',
        codSala: '',
      },
      ['Turma liberada', `${turma.nome} não está mais vinculada a ${sala.nome}.`],
      'Falha ao liberar turma',
    );
  }

  /**
   * Grava o vínculo e só recarrega depois que o RM terminou (o backend espera a Fórmula Visual).
   * Antes, a tela recarregava antes da gravação e parecia que nada tinha sido salvo.
   */
  private gravarVinculo(
    celula: { salaId: string; turno: Turno },
    request: Parameters<OcupacaoApiService['salvarTurmaXSala']>[0],
    [tituloSucesso, descricaoSucesso]: [string, string],
    tituloFalha: string,
  ): void {
    this._gravando.set(celula);
    this.ocupacaoApi
      .salvarTurmaXSala(request)
      .pipe(finalize(() => this._gravando.set(null)))
      .subscribe({
        next: (res) => {
          if (res.sucesso !== 1) {
            this.toast.danger(tituloFalha, 'Tente novamente.');
            return;
          }
          if (res.concluido === false) {
            this.toast.info('O RM ainda está gravando', 'A tela atualiza sozinha em alguns segundos.');
            setTimeout(() => this.carregar(), RECARGA_APOS_GRAVACAO_PENDENTE_MS);
            return;
          }
          this.toast.success(tituloSucesso, descricaoSucesso);
          this.carregar();
        },
        error: (err) => {
          // O backend devolve a causa (ex.: "O RM não gravou o vínculo: ...") em `message`; erro de
          // validação do ASP.NET vem como ProblemDetails, com o texto em `title`.
          this.toast.danger(
            tituloFalha,
            err?.error?.message ?? err?.error?.title ?? 'Não foi possível contatar o servidor.',
          );
        },
      });
  }

  adicionarCarteiras(salaId: string, quantidade: number): void {
    this._salas.update((list) =>
      list.map((s) => (s.id === salaId ? { ...s, carteiras: s.carteiras + quantidade } : s)),
    );
  }

  /** Move `quantidade` carteira(s) vaga(s) de uma sala para outra (drag-and-drop da tela Planta). */
  transferirCarteira(origem: Sala, destino: Sala, quantidade = 1): void {
    const codUsuario = this.authService.currentUser()?.username ?? '';
    if (!codUsuario) return;
    this.ocupacaoApi
      .transferirCarteira({
        codUsuario,
        origem: {
          codFilial: origem.codFilial,
          codBloco: origem.codBloco,
          codPredio: origem.codPredio,
          codSala: origem.codSala,
        },
        destino: {
          codFilial: destino.codFilial,
          codBloco: destino.codBloco,
          codPredio: destino.codPredio,
          codSala: destino.codSala,
        },
        quantidade,
      })
      .subscribe({
        next: (res) => {
          if (res.sucesso === 1) {
            this.toast.success('Carteira transferida', `${origem.nome} → ${destino.nome}.`);
            this.carregar();
          } else {
            this.toast.danger('Não foi possível transferir', 'tente novamente');
          }
        },
        error: (err) => {
          const mensagem = err?.error?.message ?? 'Não foi possível contatar o servidor.';
          this.toast.danger('Falha ao transferir carteira', mensagem);
        },
      });
  }
}
