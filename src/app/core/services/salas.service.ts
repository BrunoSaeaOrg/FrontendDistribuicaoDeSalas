import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { fundirSalasEApi } from '../mock/ocupacao-adapter';
import { Sala, StatusInfo, StatusOcupacao, Turno, TurmaLivre, Unidade } from '../models';
import { OcupacaoApiService } from './ocupacao-api.service';
import { RegrasService } from './regras.service';
import { ToastService } from './toast.service';

const ANO_LETIVO = '2026';

@Injectable({ providedIn: 'root' })
export class SalasService {
  private readonly ocupacaoApi = inject(OcupacaoApiService);
  private readonly authService = inject(AuthService);

  private readonly _unidades = signal<Unidade[]>([]);
  private readonly _salas = signal<Sala[]>([]);
  private readonly _turmasLivres = signal<TurmaLivre[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  /** Usuario cuja carga ja foi disparada, evita refetch a cada reavaliacao do effect. */
  private usuarioCarregado: string | null = null;

  readonly unidades = this._unidades.asReadonly();
  readonly salas = this._salas.asReadonly();
  readonly turmasLivres = this._turmasLivres.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

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
      return a + Math.max(0, this.capacidade(s) - ocupacao);
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

  capacidade(sala: Sala): number {
    return sala.carteiras;
  }

  alunosNoTurno(sala: Sala, turno: Turno): number {
    return sala.turnos[turno]?.alunos ?? 0;
  }

  statusInfo(sala: Sala): StatusInfo {
    const cap = this.capacidade(sala);
    const maiorOcupacao = Math.max(0, ...(['manha', 'tarde'] as Turno[]).map((t) => this.alunosNoTurno(sala, t)));
    const ratio = cap > 0 ? maiorOcupacao / cap : 0;
    const limite = (this.regrasService.regras().pctMaximoUtilizacao ?? 90) / 100;
    if (ratio > 1) return { label: 'Excedida', tone: 'danger', key: 'excedida' as StatusOcupacao };
    if (ratio >= limite) return { label: 'Quase lotada', tone: 'warning', key: 'quase' as StatusOcupacao };
    return { label: 'Disponível', tone: 'success', key: 'disponivel' as StatusOcupacao };
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

  /** Vincula uma turma sem sala (OC_SAL_TURMAS) à sala informada, persistindo via OC_SAL_TURMASXSALAS_SALVAR. */
  vincularTurno(sala: Sala, turma: TurmaLivre): void {
    this.ocupacaoApi
      .salvarTurmaXSala({
        codFilial: sala.codFilial,
        codTurma: turma.codTurma,
        idPerlet: turma.idPerlet,
        codBloco: sala.codBloco,
        codPredio: sala.codPredio,
        codSala: sala.codSala,
      })
      .subscribe({
        next: (res) => {
          if (res.sucesso === 1) {
            this.toast.success('Turma vinculada', `${turma.nome} vinculada a ${sala.nome}.`);
            this.carregar();
          } else {
            this.toast.danger('Não foi possível vincular', 'tente novamente');
          }
        },
        error: (err) => {
          this.toast.danger('Falha ao vincular turma','Não foi possível contatar o servidor.');
        },
      });
  }

  /** Remove o vínculo turma-sala enviando OC_SAL_TURMASXSALAS_SALVAR com sala vazia. */
  liberarTurno(sala: Sala, turno: Turno): void {
    const turma = sala.turnos[turno];
    if (!turma) return;
    this.ocupacaoApi
      .salvarTurmaXSala({
        codFilial: sala.codFilial,
        codTurma: turma.codTurma,
        idPerlet: turma.idPerlet,
        codBloco: '',
        codPredio: '',
        codSala: '',
      })
      .subscribe({
        next: (res) => {
          if (res.sucesso === 1) {
            this.toast.success('Turma liberada', `${turma.nome} não está mais vinculada a ${sala.nome}.`);
            this.carregar();
          } else {
            this.toast.danger('Não foi possível liberar', 'tente novamente');
          }
        },
        error: (err) => {
          this.toast.danger('Falha ao liberar turma',  'Não foi possível contatar o servidor.');
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
        error: () => {
          this.toast.danger('Falha ao transferir carteira', 'Não foi possível contatar o servidor.');
        },
      });
  }
}
