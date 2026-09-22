export type Turno = 'manha' | 'tarde';

export interface TurmaVinculada {
  nome: string;
  nomeProprio: string;
  alunos: number;
  codTurma: string;
  idPerlet: number;
  segmento: string;
}

export type Turnos = Partial<Record<Turno, TurmaVinculada | null>>;

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

export type StatusOcupacao = 'disponivel' | 'quase' | 'excedida';

export interface StatusInfo {
  label: string;
  tone: 'success' | 'warning' | 'danger';
  key: StatusOcupacao;
}
