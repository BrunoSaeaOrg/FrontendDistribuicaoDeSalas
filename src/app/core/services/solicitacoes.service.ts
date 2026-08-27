import { Injectable, signal } from '@angular/core';
import { gerarSolicitacoes } from '../mock/mock-data.generator';
import { Sala, Solicitacao } from '../models';
import { SalasService } from './salas.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class SolicitacoesService {
  private readonly _solicitacoes = signal<Solicitacao[]>([]);
  readonly solicitacoes = this._solicitacoes.asReadonly();

  constructor(
    private readonly salasService: SalasService,
    private readonly toast: ToastService,
  ) {
    this._solicitacoes.set(gerarSolicitacoes(this.salasService.salas()));
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
