import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { finalize, firstValueFrom, forkJoin } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { fundirSalasEApi } from '../mock/ocupacao-adapter';
import {
  Sala,
  StatusInfo,
  StatusOcupacao,
  Turno,
  TurmaEmOutraSala,
  TurmaLivre,
  TurmaVinculada,
  Unidade,
} from '../models';
import { OcupacaoApiService } from './ocupacao-api.service';
import { RegrasService } from './regras.service';
import { ToastService } from './toast.service';

/** Ano letivo de partida: o do calendário, até o RM dizer quais anos têm turmas. */
const anoCorrente = () => String(new Date().getFullYear());

/**
 * Série da turma pelo nome — a API não expõe esse campo. No RM o mesmo ano vem como "6º ANO A",
 * "6º Ano B" e "6º ano C - Manhã", e o Infantil como "INFANTIL 2", "Infantil 2A" e
 * "Infantil 2 - Semi Manhã A": tudo vira uma série só, "6º Ano", "1ª Série" ou "Infantil 2". Nome
 * fora desses padrões perde só o turno e a letra da turma no fim.
 */
export function serieDaTurma(nome: string): string {
  const ano = /^\s*(\d+)\s*[º°o]\s*ano\b/iu.exec(nome);
  if (ano) return `${ano[1]}º Ano`;
  const serie = /^\s*(\d+)\s*[ªa]\s*s[ée]rie\b/iu.exec(nome);
  if (serie) return `${serie[1]}ª Série`;
  const infantil = /^\s*infantil\s*(\d+)/iu.exec(nome);
  if (infantil) return `Infantil ${infantil[1]}`;
  return nome
    .replace(/\s*-\s*(semi-?\s*)?(manh[ãa]|tarde|noite|integral)\s*$/i, '')
    .replace(/\s+[A-Z]$/, '')
    .trim();
}

/** Se o RM passou do tempo de espera do backend, recarrega depois deste intervalo. */
const RECARGA_APOS_GRAVACAO_PENDENTE_MS = 8000;

/** Gravação em andamento numa célula (sala e turno) da tela Turmas. */
export interface Gravacao {
  salaId: string;
  turno: Turno;
  /** Liberação: a turma que está saindo da sala. Sem ela, é um vínculo de turmas novas. */
  codTurma?: string;
  /** Vínculo de várias turmas: qual gravação de quantas (o RM grava uma por vez). */
  atual?: number;
  total?: number;
}

/**
 * Texto da falha de gravação: o backend devolve a causa (ex.: "O RM não gravou o vínculo: ...") em
 * `message`; erro de validação do ASP.NET vem como ProblemDetails, com o texto em `title`.
 */
function motivoDaFalha(err: unknown): string {
  const corpo = (err as { error?: { message?: string; title?: string } } | null)?.error;
  return corpo?.message ?? corpo?.title ?? 'Não foi possível contatar o servidor.';
}

/** Turma a vincular; com `salaAtual`, ela está em outra sala e será movida. */
export type TurmaParaVincular = Pick<TurmaLivre, 'codTurma' | 'idPerlet' | 'nome'> & { salaAtual?: string };

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
  private readonly _gravando = signal<Gravacao | null>(null);
  private readonly _anosLetivos = signal<string[]>([anoCorrente()]);
  private readonly _anoLetivo = signal(anoCorrente());
  /** Usuario cuja carga ja foi disparada, evita refetch a cada reavaliacao do effect. */
  private usuarioCarregado: string | null = null;
  /** Numera as cargas: a resposta de um ano trocado no meio do caminho é descartada. */
  private carga = 0;

  readonly unidades = this._unidades.asReadonly();
  readonly salas = this._salas.asReadonly();
  readonly turmasLivres = this._turmasLivres.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly gravando = this._gravando.asReadonly();
  /** Alguma gravação em andamento: trava vincular/liberar nas outras células também. */
  readonly salvando = computed(() => this._gravando() !== null);

  /** Anos letivos do usuário (OC_SAL_ANOS → API.OC.SAL.ANO no RM), do mais antigo ao mais novo. */
  readonly anosLetivos = this._anosLetivos.asReadonly();
  /** Ano letivo carregado (parâmetro ANO de OC_SAL_SALAS_ANO, OC_SAL_TURMASXSALAS e OC_SAL_TURMAS). */
  readonly anoLetivo = this._anoLetivo.asReadonly();

  /** Segmentos existentes nos dados (campo SEGMENTO da API), ordenados. */
  readonly segmentos = computed(() => {
    const set = new Set<string>();
    this._salas().forEach((s) =>
      (['manha', 'tarde'] as Turno[]).forEach((t) =>
        this.turmasNoTurno(s, t).forEach((turma) => {
          if (turma.segmento) set.add(turma.segmento);
        }),
      ),
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
      (['manha', 'tarde'] as Turno[]).forEach((t) =>
        this.turmasNoTurno(s, t).forEach((turma) => set.add(this.serieFromNome(turma.nome))),
      ),
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
        this._anosLetivos.set([anoCorrente()]);
        this._anoLetivo.set(anoCorrente());
        return;
      }
      if (usuario === this.usuarioCarregado) return;
      this.usuarioCarregado = usuario;
      // Carrega o ano do calendário sem esperar a lista de anos; se ele não existir no RM,
      // carregarAnos troca para outro.
      this.carregar();
      this.carregarAnos(usuario);
    });
  }

  /** Recarrega salas, vinculos e turmas livres do usuario autenticado, no ano letivo em uso. */
  carregar(): void {
    const codUsuario = this.authService.currentUser()?.username ?? '';
    if (!codUsuario) return;
    const ano = this._anoLetivo();
    const carga = ++this.carga;
    this._loading.set(true);
    this._error.set(null);

    forkJoin([
      // As salas também são do ano: um ano sem período aberto no RM não tem sala nenhuma.
      this.ocupacaoApi.getSalasDoAno(codUsuario, ano),
      this.ocupacaoApi.getTurmasXSalas(codUsuario, ano),
      this.ocupacaoApi.getTurmas(codUsuario, ano),
    ]).subscribe({
      next: ([salasDto, turmasXSalasDto, turmasDto]) => {
        if (carga !== this.carga) return;
        const { unidades, salas, turmasLivres } = fundirSalasEApi(salasDto, turmasXSalasDto, turmasDto);
        this._unidades.set(unidades);
        this._salas.set(salas);
        this._turmasLivres.set(turmasLivres);
        this._loading.set(false);
      },
      error: (err) => {
        if (carga !== this.carga) return;
        this._error.set('Não foi possível carregar as salas.');
        this._loading.set(false);
        this.toast.danger('Falha ao carregar salas','Não foi possível contatar o servidor.');
      },
    });
  }

  /** Troca o ano letivo e recarrega as salas, os vínculos e as turmas daquele ano. */
  selecionarAno(ano: string): void {
    if (!ano || ano === this._anoLetivo()) return;
    this._anoLetivo.set(ano);
    this.carregar();
  }

  /**
   * Busca no RM os anos letivos do usuário (API.OC.SAL.ANO). Se o ano em uso não está entre eles
   * (o ano virou e o novo ainda não foi aberto), passa para o mais recente que não seja futuro.
   */
  private carregarAnos(codUsuario: string): void {
    this.ocupacaoApi.getAnosLetivos(codUsuario).subscribe({
      next: (anos) => {
        const lista = anos.map((a) => a.ANO);
        if (lista.length === 0) return;
        this._anosLetivos.set(lista);
        if (!lista.includes(this._anoLetivo())) {
          const corrente = Number(anoCorrente());
          this.selecionarAno(lista.filter((a) => Number(a) <= corrente).at(-1) ?? lista[0]);
        }
      },
      // Sem a lista, o seletor fica só com o ano em uso.
      error: () => {},
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
      .filter((s) => s.id !== sala.id && s.codFilial === sala.codFilial)
      .flatMap((s) =>
        this.turmasNoTurno(s, turno).map((t) => ({
          codTurma: t.codTurma,
          idPerlet: t.idPerlet,
          nome: t.nome,
          alunos: t.alunos,
          salaAtual: s.nome,
        })),
      )
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  capacidade(sala: Sala): number {
    return sala.capacidade;
  }

  /** Turmas vinculadas à sala no turno (pode ser mais de uma); vazio = sala livre. */
  turmasNoTurno(sala: Sala, turno: Turno): TurmaVinculada[] {
    return sala.turnos[turno] ?? [];
  }

  /** Soma dos alunos das turmas da sala no turno. */
  alunosNoTurno(sala: Sala, turno: Turno): number {
    return this.turmasNoTurno(sala, turno).reduce((total, t) => total + t.alunos, 0);
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

  /** Série da turma pelo nome (ver serieDaTurma): "1º ano A - Manhã" → "1º Ano". */
  serieFromNome(nome: string): string {
    return serieDaTurma(nome);
  }

  /**
   * Vincula as turmas à sala no turno via OC_SAL_TURMASXSALAS_SALVAR, uma de cada vez: cada
   * gravação é um job da Fórmula Visual, e jobs em paralelo disputariam o RM. As que têm
   * `salaAtual` saem da sala em que estão. Recarrega uma vez no fim e devolve as que falharam,
   * para a tela mantê-las selecionadas.
   */
  async vincularTurmas<T extends TurmaParaVincular>(sala: Sala, turno: Turno, turmas: T[]): Promise<T[]> {
    const gravadas: T[] = [];
    const falhas: { turma: T; motivo: string }[] = [];
    let pendente = false;

    for (const [i, turma] of turmas.entries()) {
      this._gravando.set({ salaId: sala.id, turno, atual: i + 1, total: turmas.length });
      try {
        const res = await firstValueFrom(
          this.ocupacaoApi.salvarTurmaXSala({
            codFilial: sala.codFilial,
            codTurma: turma.codTurma,
            idPerlet: turma.idPerlet,
            codBloco: sala.codBloco,
            codPredio: sala.codPredio,
            codSala: sala.codSala,
          }),
        );
        if (res.sucesso !== 1) {
          falhas.push({ turma, motivo: 'Tente novamente.' });
          continue;
        }
        gravadas.push(turma);
        if (res.concluido === false) pendente = true;
      } catch (err) {
        falhas.push({ turma, motivo: motivoDaFalha(err) });
      }
    }
    this._gravando.set(null);

    if (gravadas.length > 0) {
      if (pendente) {
        this.toast.info('O RM ainda está gravando', 'A tela atualiza sozinha em alguns segundos.');
        setTimeout(() => this.carregar(), RECARGA_APOS_GRAVACAO_PENDENTE_MS);
      } else {
        const [unica] = gravadas;
        if (gravadas.length > 1) {
          this.toast.success('Turmas vinculadas', `${gravadas.length} turmas vinculadas a ${sala.nome}.`);
        } else if (unica.salaAtual) {
          this.toast.success('Turma movida', `${unica.nome} saiu de ${unica.salaAtual} e foi para ${sala.nome}.`);
        } else {
          this.toast.success('Turma vinculada', `${unica.nome} vinculada a ${sala.nome}.`);
        }
        this.carregar();
      }
    }
    if (falhas.length === 1) {
      this.toast.danger(`Falha ao vincular ${falhas[0].turma.nome}`, falhas[0].motivo);
    } else if (falhas.length > 1) {
      this.toast.danger(
        'Falha ao vincular turmas',
        `${falhas.map((f) => f.turma.nome).join(', ')} não foram vinculadas. ${falhas[0].motivo}`,
      );
    }
    return falhas.map((f) => f.turma);
  }

  /** Tira uma turma da sala enviando OC_SAL_TURMASXSALAS_SALVAR com sala vazia. */
  liberarTurma(sala: Sala, turno: Turno, turma: TurmaVinculada): void {
    this.gravarVinculo(
      { salaId: sala.id, turno, codTurma: turma.codTurma },
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
    celula: Gravacao,
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
        error: (err) => this.toast.danger(tituloFalha, motivoDaFalha(err)),
      });
  }

  adicionarCarteiras(salaId: string, quantidade: number): void {
    this._salas.update((list) =>
      list.map((s) => (s.id === salaId ? { ...s, carteiras: s.carteiras + quantidade } : s)),
    );
  }

  /**
   * Move `quantidade` carteira(s) vaga(s) de uma sala para outra (drag-and-drop da tela Planta), no
   * período letivo do ano em uso.
   */
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
        ano: this._anoLetivo(),
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
          // A falha pode vir depois de as carteiras já terem mudado (no histórico): a tela relê o RM.
          this.carregar();
        },
      });
  }
}
