export interface ApiSalaDto {
  CODFILIAL: number;
  /** OC_SAL_SALAS devolve o nome da unidade em FILIAL; OC_SAL_TURMASXSALAS usa UNIDADE. */
  FILIAL?: string;
  UNIDADE?: string;
  CODBLOCO: string;
  CODPREDIO: string;
  CODTIPOSALA: number;
  TIPOSALA: string;
  CODSALA: string;
  SALA: string;
  ANDAR: string;
  CARTEIRAS: number;
  CAPACIDADE: number;
  CAPACIDADEMAXIMA: number;
  AREA: number;
}

export interface ApiTurmaXSalaDto extends ApiSalaDto {
  UNIDADE: string;
  ANOLETIVO: string;
  IDPERLET: number;
  SEGMENTO: string;
  CODTURMA: string;
  TURMA: string;
  TURNO: string;
  OCUPACAO: number;
}

export interface ApiTurmaDto {
  ANOLETIVO: string;
  IDPERLET: number;
  CODFILIAL: number;
  UNIDADE: string;
  SEGMENTO: string;
  CODTURMA: string;
  TURMA: string;
  TURNO: string;
  OCUPACAO: number;
}
