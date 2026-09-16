import { effect, inject, Injectable, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { ApiSolicitacaoDto, ApiStatusSolicitacao } from '../models/ocupacao-api.model';
import { Sala, Solicitacao, StatusSolicitacao } from '../models';
import { OcupacaoApiService } from './ocupacao-api.service';
import { SalasService } from './salas.service';
import { ToastService } from './toast.service';

const STATUS_API_PARA_LOCAL: Record<ApiStatusSolicitacao, StatusSolicitacao> = {
  P: 'pendente',
  A: 'aprovada',
  R: 'recusada',
};

/**
 * SolicitacaoDto nao traz UNIDADE/SALA (nao existem no ZMDOC_SOLICITACOES) — resolve pelo
 * cadastro de salas ja carregado, casando pelas chaves CODFILIAL/CODBLOCO/CODPREDIO/CODSALA.
 */
function paraSolicitacao(dto: ApiSolicitacaoDto, salasService: SalasService): Solicitacao {
  const sala = salasService.salaPorChave(dto.codFilial, dto.codBloco, dto.codPredio, dto.codSala);
  return {
    id: 'sol-' + dto.codSolicitacao,
    codSolicitacao: dto.codSolicitacao,
    salaId: sala?.id ?? `${dto.codFilial}-${dto.codBloco}-${dto.codPredio}-${dto.codSala}`,
    salaNome: sala?.nome ?? dto.codSala,
    unidadeId: sala?.unidadeId ?? '',
    codFilial: dto.codFilial,
    quantidade: dto.quantidade,
    justificativa: dto.justificativa,
    status: STATUS_API_PARA_LOCAL[dto.status],
    data: dto.dataSolicitacao ? new Date(dto.dataSolicitacao).toLocaleDateString('pt-BR') : '',
  };
}

@Injectable({ providedIn: 'root' })
export class SolicitacoesService {
  private readonly ocupacaoApi = inject(OcupacaoApiService);
  private readonly authService = inject(AuthService);

  private readonly _solicitacoes = signal<Solicitacao[]>([]);
  private readonly _loading = signal(false);
  private readonly _enviando = signal(false);
  /**
   * codSolicitacao -> decisao ('A'/'R') em andamento — varias solicitacoes podem estar
   * pendentes ao mesmo tempo, e cada uma sabe se foi Aprovar ou Recusar que foi clicado.
   */
  private readonly _decidindo = signal<ReadonlyMap<number, ApiStatusSolicitacao>>(new Map());
  readonly solicitacoes = this._solicitacoes.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** True enquanto uma nova solicitacao esta sendo enviada (OC_SAL_SOLICITACAO_CRIAR). */
  readonly enviando = this._enviando.asReadonly();
  /** Usuario cuja carga ja foi disparada, evita refetch a cada reavaliacao do effect. */
  private usuarioCarregado: string | null = null;

  constructor(
    private readonly salasService: SalasService,
    private readonly toast: ToastService,
  ) {
    effect(() => {
      const usuario = this.authService.currentUser()?.username;
      if (!usuario) {
        this.usuarioCarregado = null;
        this._solicitacoes.set([]);
        return;
      }
      const salas = this.salasService.salas();
      if (salas.length === 0) return;
      if (usuario === this.usuarioCarregado) return;
      this.usuarioCarregado = usuario;
      this.carregar();
    });
  }

  /** Recarrega as solicitacoes da(s) filial(is) do usuario autenticado. */
  carregar(): void {
    const codUsuario = this.authService.currentUser()?.username ?? '';
    if (!codUsuario) return;
    const filiais = this.salasService.filiais();
    if (filiais.length === 0) return;

    this._loading.set(true);
    let restantes = filiais.length;
    // Map em vez de array: o TOTVS as vezes ignora o filtro CODFILIAL do ListAsync e devolve
    // a lista inteira em cada chamada — deduplicar por codSolicitacao evita repetir a mesma
    // solicitacao uma vez por filial do usuario.
    const acumulado = new Map<number, Solicitacao>();

    filiais.forEach(({ codFilial }) => {
      this.ocupacaoApi.getSolicitacoes(codUsuario, codFilial).subscribe({
        next: (dtos) => {
          dtos.forEach((dto) => {
            const sol = paraSolicitacao(dto, this.salasService);
            acumulado.set(sol.codSolicitacao, sol);
          });
          restantes--;
          if (restantes === 0) {
            this._solicitacoes.set(Array.from(acumulado.values()));
            this._loading.set(false);
          }
        },
        error: () => {
          restantes--;
          this.toast.danger('Falha ao carregar solicitações', 'Não foi possível contatar o servidor.');
          if (restantes === 0) {
            this._solicitacoes.set(Array.from(acumulado.values()));
            this._loading.set(false);
          }
        },
      });
    });
  }

  criar(sala: Sala, quantidade: number, justificativa: string): void {
    const codUsuario = this.authService.currentUser()?.username ?? '';
    this._enviando.set(true);
    this.ocupacaoApi
      .criarSolicitacao({
        codUsuario,
        codFilial: sala.codFilial,
        codBloco: sala.codBloco,
        codPredio: sala.codPredio,
        codSala: sala.codSala,
        quantidade,
        justificativa,
      })
      .subscribe({
        next: () => {
          this._enviando.set(false);
          this.toast.success('Solicitação enviada', 'Aguardando aprovação do coordenador.');
          this.carregar();
        },
        error: () => {
          this._enviando.set(false);
          this.toast.danger('Falha ao enviar solicitação', 'Não foi possível contatar o servidor.');
        },
      });
  }

  aprovar(sol: Solicitacao): void {
    this.decidir(sol, 'A');
  }

  recusar(sol: Solicitacao): void {
    this.decidir(sol, 'R');
  }

  /** Retorna 'A'/'R' se a solicitacao esta sendo decidida agora, ou null se nao houver decisao em andamento. */
  decidindoComo(codSolicitacao: number): ApiStatusSolicitacao | null {
    return this._decidindo().get(codSolicitacao) ?? null;
  }

  private marcarDecidindo(codSolicitacao: number, decisao: ApiStatusSolicitacao | null): void {
    this._decidindo.update((atual) => {
      const proximo = new Map(atual);
      if (decisao) proximo.set(codSolicitacao, decisao);
      else proximo.delete(codSolicitacao);
      return proximo;
    });
  }

  private decidir(sol: Solicitacao, decisao: ApiStatusSolicitacao): void {
    const codUsuario = this.authService.currentUser()?.username ?? '';
    this.marcarDecidindo(sol.codSolicitacao, decisao);
    this.ocupacaoApi.decidirSolicitacao({ codUsuario, codSolicitacao: sol.codSolicitacao, decisao }).subscribe({
      next: () => {
        this.marcarDecidindo(sol.codSolicitacao, null);
        if (decisao === 'A') {
          this.toast.success(
            'Solicitação aprovada',
            `${sol.quantidade} carteira(s) adicionada(s) em ${sol.salaNome}.`,
          );
          this.salasService.carregar();
        } else {
          this.toast.info('Solicitação recusada', `Pedido de ${sol.salaNome} foi recusado.`);
        }
        this.carregar();
      },
      error: () => {
        this.marcarDecidindo(sol.codSolicitacao, null);
        this.toast.danger('Falha ao decidir solicitação', 'Não foi possível contatar o servidor.');
      },
    });
  }
}
