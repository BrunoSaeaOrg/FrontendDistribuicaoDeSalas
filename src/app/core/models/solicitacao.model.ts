export type StatusSolicitacao = 'pendente' | 'aprovada' | 'recusada';

export interface Solicitacao {
  id: string;
  codSolicitacao: number;
  salaId: string;
  salaNome: string;
  unidadeId: string;
  codFilial: number;
  quantidade: number;
  justificativa: string;
  status: StatusSolicitacao;
  data: string;
}
