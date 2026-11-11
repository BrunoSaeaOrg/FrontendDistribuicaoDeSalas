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
  /** Plano sem ano de destino (a pessoa ainda não escolheu o "Para"): a sala só é listada. */
  | 'sem-destino'
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

/**
 * Aluno de OC_SAL_ENTUR_ALUNOS (pré-enturmação, API.OC.ENTUR.GER): um por RA, matriculado no ano
 * na filial. codTurma é a turma da matrícula; null = ainda sem turma.
 */
export interface ApiAlunoEnturmacaoDto {
  ra: string;
  nome: string;
  codFilial: number;
  segmento: string;
  codCurso: string;
  codHabilitacao: string;
  /** "5º Ano - Ensino Fundamental - Manhã - EF I". */
  serie: string;
  codTurma: string | null;
  /** Tipo do turno da habilitação: M, V ou I. */
  turno: string;
  /** Entrou por processo seletivo. */
  novo: boolean;
  serieAnterior: string | null;
  /** Turma do ano anterior; com duas matrículas, as duas ("EF1M-T / EF1C-M"). */
  turmaAnterior: string | null;
  dataMatricula: string | null;
  obs: string | null;
  /** A escola de onde o aluno veio. Opcional: o backend antes desta versão não manda. */
  instituicaoOrigem?: string | null;
}

/**
 * Turma do cadastro de OC_SAL_ENTUR_TURMAS (API.OC.ENTUR.TUR): o destino da tela Vincular aluno, com
 * ou sem sala e com ou sem aluno. As subturmas (Integral, Semi) vêm como turmas próprias. codCurso,
 * codHabilitacao e turno só vêm se a consulta tiver as colunas; sem elas, a série sai do nome.
 */
export interface ApiTurmaEnturmacaoDto {
  codTurma: string;
  /** "3º Ano A - Manhã". */
  nome: string;
  idPerlet: number;
  segmento: string | null;
  codCurso?: string | null;
  codHabilitacao?: string | null;
  turno?: string | null;
}

/** Movimento gravado no MD de enturmação e ainda não importado para a matrícula (OC_SAL_ENTUR_PENDENTES). */
export interface ApiEnturmacaoPendenteDto {
  ra: string;
  /** Para onde o aluno vai quando a enturmação for importada. */
  codTurma: string;
}

/**
 * Resultado de cada aluno em OC_SAL_ENTUR_SALVAR: "pendente" = gravado no MD, falta importar;
 * "na-matricula" = voltou para a turma da matrícula (nada a importar); "falhou", com o motivo.
 */
export interface ApiEnturmacaoResultadoDto {
  ra: string;
  codTurma: string;
  situacao: 'pendente' | 'na-matricula' | 'falhou';
  motivo: string | null;
}

/** Prédio e bloco de uma unidade, onde a sala nova pode ficar (OC_SAL_SALA_NOVA_OPCOES). */
export interface ApiSalaNovaLocalDto {
  codPredio: string;
  predio: string;
  codBloco: string;
  bloco: string;
}

/** Sala que já está no cadastro do RM, de qualquer ano: o código não pode se repetir. */
export interface ApiSalaCadastradaDto {
  codPredio: string;
  codBloco: string;
  codSala: string;
  sala: string;
}

/** Unidade (filial) em que o usuário pode criar uma sala, com os anos que têm período letivo nela. */
export interface ApiSalaNovaUnidadeDto {
  codFilial: number;
  /** Como o RM escreve ("CASJ - UNIDADE I"); a tela mostra "CASJ 1". */
  unidade: string;
  anos: string[];
  locais: ApiSalaNovaLocalDto[];
  salas: ApiSalaCadastradaDto[];
  /** Salas do pedagógico que já estão no cadastro do RM e faltam em algum ano da unidade. */
  preCriadas: ApiSalaPreCriadaDto[];
}

/**
 * Sala pré-criada (OC_SAL_SALA_NOVA_OPCOES): do pedagógico, no cadastro do RM, mas fora de algum
 * ano letivo da unidade. A Nova sala só a coloca nos anos, com os dados do cadastro.
 */
export interface ApiSalaPreCriadaDto {
  codPredio: string;
  codBloco: string;
  codSala: string;
  sala: string;
  /** "T" (térreo) ou o número do andar. */
  andar: string;
  codTipoSala: number;
  tipoSala: string;
  area: number | null;
  /** Do ano mais recente em que a sala já está (`anoDosNumeros`) ou, sem nenhum, do cadastro; null = o RM não tem. */
  capacidade: number | null;
  carteiras: number | null;
  /** O ano de onde vieram capacidade e carteiras; null = do cadastro. */
  anoDosNumeros: string | null;
  jaEsta: string[];
  faltam: string[];
}

export interface ApiTipoSalaDto {
  codTipoSala: number;
  nome: string;
}

/** O que o formulário de sala nova precisa (OC_SAL_SALA_NOVA_OPCOES). Só lê o RM. */
export interface ApiSalaNovaOpcoesDto {
  unidades: ApiSalaNovaUnidadeDto[];
  tipos: ApiTipoSalaDto[];
}

/** A sala nova de OC_SAL_SALA_CRIAR: vai para o cadastro do RM e para os anos marcados. */
export interface SalaNovaPedido {
  codFilial: number;
  codPredio: string;
  codBloco: string;
  codSala: string;
  descricao: string;
  codTipoSala: number;
  /** "T" (térreo) ou o número do andar. */
  andar: string;
  /** Em m²; null quando não se sabe. */
  area: number | null;
  capacidade: number;
  carteiras: number;
  anos: string[];
  /** Sala pré-criada: já está no cadastro, só ganha o registro dos anos (nome, andar, tipo e área do pedido não valem). */
  existente: boolean;
}

/** Como a sala ficou em cada ano pedido: "incluida", "ja-existe" ou "falhou" (com o motivo). */
export interface ApiSalaNoAnoDto {
  ano: string;
  idPerlet: number | null;
  situacao: 'incluida' | 'ja-existe' | 'falhou';
  erro: string | null;
}

/** Resposta de OC_SAL_SALA_CRIAR: a sala já está no cadastro do RM; cada ano diz se ela entrou. */
export interface ApiSalaCriadaDto {
  codFilial: number;
  codSala: string;
  sala: string;
  anos: ApiSalaNoAnoDto[];
}
