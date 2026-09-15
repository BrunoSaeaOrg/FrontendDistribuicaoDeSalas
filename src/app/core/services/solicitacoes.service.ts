import { effect, Injectable, signal } from '@angular/core';
import { gerarSolicitacoes } from '../mock/mock-data.generator';
import { Sala, Solicitacao } from '../models';
import { SalasService } from './salas.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class SolicitacoesService {
  private readonly _solicitacoes = signal<Solicitacao[]>([]);
  readonly solicitacoes = this._solicitacoes.asReadonly();
  private seeded = false;

  constructor(
    private readonly salasService: SalasService,
    private readonly toast: ToastService,
  ) {
    effect(() => {
      const salas = this.salasService.salas();
      if (salas.length === 0) {
        // Logout / troca de usuario zera as salas: libera o seed para a proxima carga.
        this.seeded = false;
        this._solicitacoes.set([]);
        return;
      }
      if (this.seeded) return;
      this.seeded = true;
      this._solicitacoes.set(gerarSolicitacoes(salas));
    });
  }

  criar(sala: Sala, quantidade: number, justificativa: string): void {
    const novo: Solicitacao = {
      id: 'sol-' + Date.now(),
      salaId: sala.id,
      salaNome: sala.nome,
      unidadeId: sala.unidadeId,
      quantidade,
      justificativa,
      status: 'pendente',
      data: new Date().toLocaleDateString('pt-BR'),
    };
    this._solicitacoes.update((list) => [novo, ...list]);
    this.toast.success('Solicitação enviada', 'Aguardando aprovação do coordenador.');
  }

  aprovar(sol: Solicitacao): void {
    this.salasService.adicionarCarteiras(sol.salaId, sol.quantidade);
    this._solicitacoes.update((list) =>
      list.map((s) => (s.id === sol.id ? { ...s, status: 'aprovada' } : s)),
    );
    this.toast.success(
      'Solicitação aprovada',
      `${sol.quantidade} carteira(s) adicionada(s) em ${sol.salaNome}.`,
    );
  }

  recusar(sol: Solicitacao): void {
    this._solicitacoes.update((list) =>
      list.map((s) => (s.id === sol.id ? { ...s, status: 'recusada' } : s)),
    );
    this.toast.info('Solicitação recusada', `Pedido de ${sol.salaNome} foi recusado.`);
  }
}
