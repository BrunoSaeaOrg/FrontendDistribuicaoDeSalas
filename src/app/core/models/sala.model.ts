export type Turno = 'manha' | 'tarde';

export interface TurmaVinculada {
  nome: string;
  nomeProprio: string;
  alunos: number;
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
}

export type StatusOcupacao = 'disponivel' | 'quase' | 'excedida';

export interface StatusInfo {
  label: string;
  tone: 'success' | 'warning' | 'danger';
  key: StatusOcupacao;
}
