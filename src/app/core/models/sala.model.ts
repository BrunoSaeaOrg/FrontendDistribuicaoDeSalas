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
  carteiras: number;
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
