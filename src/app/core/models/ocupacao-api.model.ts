export interface ApiSalaDto {
  CODFILIAL: number;
  /** OC_SAL_SALAS_ANO devolve o nome da unidade em FILIAL; OC_SAL_TURMASXSALAS usa UNIDADE. */
  FILIAL?: string;
  UNIDADE?: string;
  CODBLOCO: string;
  CODPREDIO: string;
  CODTIPOSALA: number;
  TIPOSALA: string;
  CODSALA: string;
  SALA: string;
  /** "T" = térreo; os demais andares vêm só com o número ("1", "2"...). */
  ANDAR: string;
  CARTEIRAS: number;
  CAPACIDADE: number;
  CAPACIDADEMAXIMA: number;
  AREA: number;
}

/**
 * Sala do período letivo de um ano (OC_SAL_SALAS_ANO, que lê API.OC.SAL.PERIO no RM): as colunas
 * de uma sala mais o período e o ano. Só vêm as filiais com período aberto naquele ano.
 */
export interface ApiSalaDoAnoDto extends ApiSalaDto {
  IDPERLET: number;
  ANO: string;
}

/**
 * Linha de OC_SAL_TURMASXSALAS: uma turma-mãe (CODTURMA, ex.: EF3A-M) numa sala, com as subturmas
 * que estão nela em COMPOSICAO ("EF3A-M (18) + EF3A-SM (5)"). TURMA, TURNO e SEGMENTO só vêm quando a
 * subturma principal está entre elas; uma linha só com "EF3A-SM (5)" vem sem os três.
 */
export interface ApiTurmaXSalaDto extends ApiSalaDto {
  UNIDADE: string;
  ANOLETIVO: string;
  IDPERLET: number;
  SEGMENTO?: string;
  CODTURMA: string;
  TURMA?: string;
  TURNO?: string;
  OCUPACAO: number;
  COMPOSICAO?: string;
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

/**
 * Período letivo do usuário (OC_SAL_ANOS, que lê API.OC.SAL.ANO no RM): uma linha por período, então
 * o mesmo ANO se repete quando há mais de um período nele (um por filial).
 */
export interface ApiAnoLetivoDto {
  IDPERLET?: number | null;
  ANO: string;
  /** Só se a consulta trouxer a coluna: o back repassa o que vier. */
  CODFILIAL?: number | null;
}

export interface ApiRegraDto {
  CODFILIAL: number;
  FILIAL: string;
  AREAPORPESSOA: number;
  PERCMAXUTIL: number;
  /** Padrao RM (antigo TOTVS) para campo SN: 1 = Sim, 2 = Nao. */
  PERMEXCEDER: 1 | 2;
  OBS: string;
}

/**
 * Resposta de OC_SAL_REGRAS_SALVAR: o registro como ficou gravado no RM (sem FILIAL; o OBS só
 * vem se o RM tiver o campo). Não há CodRetorno: sucesso é o 200.
 */
export type ApiRegraSalvaDto = Partial<ApiRegraDto> & { id?: string };

/** Status de uma solicitacao em OC_SOLICITACOES: P = Pendente, A = Aprovada, R = Recusada. */
export type ApiStatusSolicitacao = 'P' | 'A' | 'R';

/**
 * Diferente de ApiSalaDto/ApiTurmaDto/ApiRegraDto (que sao JsonElement cru repassado do
 * TOTVS Formula Visual, em ALL-CAPS): SolicitacaoDto e uma classe C# forte (PascalCase),
 * entao o ASP.NET Core serializa em camelCase - nao ha campo `sucesso`, o proprio objeto
 * e a resposta em caso de sucesso.
 */
export interface ApiSolicitacaoDto {
  codSolicitacao: number;
  codFilial: number;
  codBloco: string;
  codPredio: string;
  codSala: string;
  quantidade: number;
  justificativa: string;
  status: ApiStatusSolicitacao;
  codUsuarioSolicitante: string;
  dataSolicitacao: string | null;
  codUsuarioDecisao: string | null;
  dataDecisao: string | null;
}

/**
 * Situação de uma sala na cópia de ano letivo (OC_SAL_COPIAR_ANO_*; ver CopiaAnoSituacao
 * no backend). Como ApiSolicitacaoDto, os DTOs da cópia são classes C#: vêm em camelCase.
 */
export type ApiSituacaoCopiaAno =
  | 'copiar'
  | 'atualizar'
  | 'ja-existe'
  | 'sem-periodo'
  | 'periodo-ambiguo'
  | 'criada'
  | 'atualizada'
  | 'falhou';

/** Uma sala do ano de origem no plano da cópia: `id` é o registro dela no PRJ4087040. */
export interface ApiCopiaSalaDto {
  id: string;
  codFilial: number;
  unidade: string;
  andar: string;
  sala: string;
  tipoSala: string;
  carteiras: number;
  capacidade: number;
  /** O que o registro do destino tem hoje; null quando o destino ainda não tem o registro. */
  carteirasNoDestino: number | null;
  capacidadeNoDestino: number | null;
  idPerletOrigem: number;
  idPerletDestino: number | null;
  situacao: ApiSituacaoCopiaAno;
}

/**
 * Plano da cópia: só as salas (o registro de carteiras e capacidade). As turmas não vão junto: as
 * de cada ano entram nas salas pela tela Salas → Turmas. O período do destino é o da filial no ano
 * de destino (API.OC.SAL.ANO traz os IDPERLET), com ou sem turma.
 */
export interface ApiCopiaAnoPlanoDto {
  salas: ApiCopiaSalaDto[];
}

export interface ApiCopiaSalaResultadoDto {
  id: string;
  situacao: ApiSituacaoCopiaAno;
  erro?: string | null;
}
