export type Turno = 'manha' | 'tarde';

export interface TurmaVinculada {
  nome: string;
  nomeProprio: string;
  alunos: number;
  codTurma: string;
  idPerlet: number;
  segmento: string;
}

/**
 * Turmas de cada turno. Uma sala pode ter mais de uma turma no mesmo turno: o vínculo é da turma
 * (OC_SAL_TURMASXSALAS), então nada no RM impede duas turmas na mesma sala. Sem turma = livre.
 */
export type Turnos = Partial<Record<Turno, TurmaVinculada[]>>;

export interface Sala {
  id: string;
  unidadeId: string;
  nome: string;
  tipo: string;
  area: number;
  /** Quantidade fisica de carteiras na sala (API: CARTEIRAS). Usado no drag-and-drop de carteiras. */
  carteiras: number;
  /** Capacidade normativa da sala, ex. area / 1,5m2 (API: CAPACIDADE). Usado em solicitacoes, painel e ocupacao. */
  capacidade: number;
  turnos: Turnos;
  codFilial: number;
  codBloco: string;
  codPredio: string;
  codSala: string;
}

/** Turma cadastrada (OC_SAL_TURMAS) sem sala vinculada em OC_SAL_TURMASXSALAS. */
export interface TurmaLivre {
  codTurma: string;
  idPerlet: number;
  codFilial: number;
  unidadeId: string;
  nome: string;
  turno: Turno;
  alunos: number;
  segmento: string;
}

/** Turma já vinculada a outra sala da mesma filial e turno: vinculá-la em outra sala a move. */
export interface TurmaEmOutraSala {
  codTurma: string;
  idPerlet: number;
  nome: string;
  alunos: number;
  /** Nome da sala em que a turma está hoje. */
  salaAtual: string;
}

export type StatusOcupacao = 'disponivel' | 'quase' | 'excedida';

export interface StatusInfo {
  label: string;
  tone: 'success' | 'warning' | 'danger';
  key: StatusOcupacao;
}
