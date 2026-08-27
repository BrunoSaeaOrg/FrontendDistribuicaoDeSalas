export type StatusSolicitacao = 'pendente' | 'aprovada' | 'recusada';

export interface Solicitacao {
  id: string;
  salaId: string;
  salaNome: string;
  unidadeId: string;
  quantidade: number;
  justificativa: string;
  status: StatusSolicitacao;
  data: string;
}
