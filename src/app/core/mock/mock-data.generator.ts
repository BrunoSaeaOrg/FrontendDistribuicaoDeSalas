import { Sala, Solicitacao } from '../models';

export function gerarSolicitacoes(salas: Sala[]): Solicitacao[] {
  const amostras = salas.filter((_, i) => i % 9 === 0).slice(0, 6);
  const status: Solicitacao['status'][] = ['pendente', 'aprovada', 'recusada', 'pendente'];
  const datas = ['12/08/2026', '15/08/2026', '18/08/2026', '20/08/2026', '21/08/2026', '24/08/2026'];
  return amostras.map((s, i) => ({
    id: 'sol-seed-' + i,
    salaId: s.id,
    salaNome: s.nome,
    unidadeId: s.unidadeId,
    quantidade: 2 + (i % 4),
    justificativa:
      i % 2 === 0 ? 'Turma cresceu após matrícula tardia.' : 'Redistribuição para nova turma no turno.',
    status: status[i % status.length],
    data: datas[i % datas.length],
  }));
}
