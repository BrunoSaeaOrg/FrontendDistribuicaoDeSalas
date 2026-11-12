import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiAlunoEnturmacaoDto,
  ApiAnoLetivoDto,
  ApiCopiaAnoPlanoDto,
  ApiCopiaSalaResultadoDto,
  ApiEnturmacaoImportacaoDto,
  ApiEnturmacaoImportadoDto,
  ApiEnturmacaoParaImportarDto,
  ApiEnturmacaoPendenteDto,
  ApiEnturmacaoResultadoDto,
  ApiRegraDto,
  ApiRegraSalvaDto,
  ApiSalaCriadaDto,
  ApiSalaDoAnoDto,
  ApiSalaNovaOpcoesDto,
  ApiSolicitacaoDto,
  ApiStatusSolicitacao,
  ApiTurmaDto,
  ApiTurmaEnturmacaoDto,
  ApiTurmaXSalaDto,
  SalaNovaPedido,
} from '../models/ocupacao-api.model';

@Injectable({ providedIn: 'root' })
export class OcupacaoApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/OcupacaoDeSalas`;

  /** Salas do período letivo do ano (um dos anos de getAnosLetivos), com as carteiras já transferidas. */
  getSalasDoAno(codUsuario: string, ano: string): Observable<ApiSalaDoAnoDto[]> {
    return this.http.post<ApiSalaDoAnoDto[]>(`${this.baseUrl}/OC_SAL_SALAS_ANO`, {
      CODUSUARIO: codUsuario,
      ANO: ano,
    });
  }

  getTurmasXSalas(codUsuario: string, ano: string): Observable<ApiTurmaXSalaDto[]> {
    return this.http.post<ApiTurmaXSalaDto[]>(`${this.baseUrl}/OC_SAL_TURMASXSALAS`, {
      CODUSUARIO: codUsuario,
      ANO: ano,
    });
  }

  getAnosLetivos(codUsuario: string): Observable<ApiAnoLetivoDto[]> {
    return this.http.post<ApiAnoLetivoDto[]>(`${this.baseUrl}/OC_SAL_ANOS`, {
      CODUSUARIO: codUsuario,
    });
  }

  /**
   * Alunos do ano na filial, com a turma da matrícula (pré-enturmação). A primeira leitura de uma
   * filial leva de 15 s a 1 min no RM; o back guarda o resultado por 5 minutos.
   */
  getAlunosEnturmacao(ano: string, codFilial: number): Observable<ApiAlunoEnturmacaoDto[]> {
    return this.http.post<ApiAlunoEnturmacaoDto[]>(`${this.baseUrl}/OC_SAL_ENTUR_ALUNOS`, {
      ANO: ano,
      CODFILIAL: String(codFilial),
    });
  }

  /** As turmas do cadastro no ano da filial: o destino da tela Vincular aluno. Leitura leve (menos de 1 s). */
  getTurmasEnturmacao(ano: string, codFilial: number): Observable<ApiTurmaEnturmacaoDto[]> {
    return this.http.post<ApiTurmaEnturmacaoDto[]>(`${this.baseUrl}/OC_SAL_ENTUR_TURMAS`, {
      ANO: ano,
      CODFILIAL: String(codFilial),
    });
  }

  /**
   * Fotos dos alunos pedidos (até 200 RAs), da mesma leitura de getAlunosEnturmacao: RA →
   * "data:image/jpeg;base64,...". RA sem foto não vem.
   */
  getFotosEnturmacao(ano: string, codFilial: number, ras: readonly string[]): Observable<Record<string, string>> {
    return this.http.post<Record<string, string>>(`${this.baseUrl}/OC_SAL_ENTUR_FOTOS`, {
      ANO: ano,
      CODFILIAL: String(codFilial),
      RAS: ras,
    });
  }

  /** Movimentos gravados no MD de enturmação que ainda não entraram na matrícula (rápido: não relê os alunos). */
  getPendentesEnturmacao(codUsuario: string, ano: string, codFilial: number): Observable<ApiEnturmacaoPendenteDto[]> {
    return this.http.post<ApiEnturmacaoPendenteDto[]>(`${this.baseUrl}/OC_SAL_ENTUR_PENDENTES`, {
      CODUSUARIO: codUsuario,
      ANO: ano,
      CODFILIAL: String(codFilial),
    });
  }

  /** Alunos cujo último registro no MD de enturmação está como Importado (já entraram na matrícula). */
  getImportadosEnturmacao(codUsuario: string, ano: string, codFilial: number): Observable<ApiEnturmacaoImportadoDto[]> {
    return this.http.post<ApiEnturmacaoImportadoDto[]>(`${this.baseUrl}/OC_SAL_ENTUR_IMPORTADOS`, {
      CODUSUARIO: codUsuario,
      ANO: ano,
      CODFILIAL: String(codFilial),
    });
  }

  /**
   * Os alunos para a secretaria importar (tela Enturmação): Pendentes e Requer Revisão no MD de
   * enturmação. A primeira leitura de uma unidade espera a dos alunos (de 15 s a 1 min).
   */
  getParaImportarEnturmacao(codUsuario: string, ano: string, codFilial: number): Observable<ApiEnturmacaoParaImportarDto[]> {
    return this.http.post<ApiEnturmacaoParaImportarDto[]>(`${this.baseUrl}/OC_SAL_ENTUR_PARA_IMPORTAR`, {
      CODUSUARIO: codUsuario,
      ANO: ano,
      CODFILIAL: String(codFilial),
    });
  }

  /**
   * Importa os alunos para a matrícula pela FV "EDU - Enturmação" do RM (só no TTESTE, por enquanto).
   * O back espera a FV terminar (até 2 min) e devolve como ficou cada aluno.
   */
  importarEnturmacao(codUsuario: string, ano: string, codFilial: number, ras: readonly string[]): Observable<ApiEnturmacaoImportacaoDto> {
    return this.http.post<ApiEnturmacaoImportacaoDto>(`${this.baseUrl}/OC_SAL_ENTUR_IMPORTAR`, {
      CODUSUARIO: codUsuario,
      ANO: ano,
      CODFILIAL: String(codFilial),
      RAS: ras,
    });
  }

  /**
   * Grava os movimentos no MD de enturmação como pendentes (até 100 por vez; o back só grava no
   * TTESTE). Cada aluno volta com o seu resultado.
   */
  salvarEnturmacao(
    codUsuario: string,
    ano: string,
    codFilial: number,
    movimentos: readonly { ra: string; codTurma: string }[],
  ): Observable<ApiEnturmacaoResultadoDto[]> {
    return this.http.post<ApiEnturmacaoResultadoDto[]>(`${this.baseUrl}/OC_SAL_ENTUR_SALVAR`, {
      CODUSUARIO: codUsuario,
      ANO: ano,
      CODFILIAL: String(codFilial),
      MOVIMENTOS: movimentos.map((m) => ({ RA: m.ra, CODTURMA: m.codTurma })),
    });
  }

  getTurmas(codUsuario: string, ano: string): Observable<ApiTurmaDto[]> {
    return this.http.post<ApiTurmaDto[]>(`${this.baseUrl}/OC_SAL_TURMAS`, {
      CODUSUARIO: codUsuario,
      ANO: ano,
    });
  }

  getRegras(codFilial: number): Observable<ApiRegraDto[]> {
    return this.http.post<ApiRegraDto[]>(`${this.baseUrl}/OC_SAL_REGRAS`, {
      CODFILIAL: String(codFilial),
    });
  }

  salvarRegras(request: {
    codFilial: number;
    areaPorPessoa: number;
    percMaxUtil: number;
    permExceder: boolean;
    obs: string;
  }): Observable<ApiRegraSalvaDto> {
    // Responde 200 com o registro como ficou no RM; falha vem como erro HTTP.
    return this.http.post<ApiRegraSalvaDto>(`${this.baseUrl}/OC_SAL_REGRAS_SALVAR`, {
      CODFILIAL: String(request.codFilial),
      // Com ponto ("1.5"); o back manda ao RM como número. Com "1,5" o RM gravava 15.
      AREAPORPESSOA: String(request.areaPorPessoa),
      PERCMAXUTIL: String(request.percMaxUtil),
      // Padrao RM (antigo TOTVS) para campo SN: 1 = Sim, 2 = Nao.
      PERMEXCEDER: request.permExceder ? '1' : '2',
      OBS: request.obs,
    });
  }

  salvarTurmaXSala(request: {
    codFilial: number;
    codTurma: string;
    idPerlet: number;
    codBloco: string;
    codPredio: string;
    codSala: string;
  }): Observable<{ sucesso: number; concluido?: boolean }> {
    // O backend só responde depois que a Fórmula Visual terminou (até ~40 s). `concluido: false`
    // = o RM ainda estava gravando quando o tempo de espera acabou.
    return this.http.post<{ sucesso: number; concluido?: boolean }>(`${this.baseUrl}/OC_SAL_TURMASXSALAS_SALVAR`, {
      CODFILIAL: String(request.codFilial),
      CODTURMA: request.codTurma,
      IDPERLET: String(request.idPerlet),
      CODBLOCO: request.codBloco,
      CODPREDIO: request.codPredio,
      CODSALA: request.codSala,
    });
  }

  getSolicitacoes(codUsuario: string, codFilial: number): Observable<ApiSolicitacaoDto[]> {
    return this.http.post<ApiSolicitacaoDto[]>(`${this.baseUrl}/OC_SAL_SOLICITACOES`, {
      CODUSUARIO: codUsuario,
      CODFILIAL: String(codFilial),
    });
  }

  criarSolicitacao(request: {
    codUsuario: string;
    codFilial: number;
    codBloco: string;
    codPredio: string;
    codSala: string;
    quantidade: number;
    justificativa: string;
  }): Observable<ApiSolicitacaoDto> {
    return this.http.post<ApiSolicitacaoDto>(`${this.baseUrl}/OC_SAL_SOLICITACAO_CRIAR`, {
      CODUSUARIO: request.codUsuario,
      CODFILIAL: String(request.codFilial),
      CODBLOCO: request.codBloco,
      CODPREDIO: request.codPredio,
      CODSALA: request.codSala,
      QUANTIDADE: request.quantidade,
      JUSTIFICATIVA: request.justificativa,
    });
  }

  decidirSolicitacao(request: {
    codUsuario: string;
    codSolicitacao: number;
    decisao: ApiStatusSolicitacao;
  }): Observable<ApiSolicitacaoDto> {
    return this.http.post<ApiSolicitacaoDto>(`${this.baseUrl}/OC_SAL_SOLICITACAO_DECIDIR`, {
      CODUSUARIO: request.codUsuario,
      CODSOLICITACAO: request.codSolicitacao,
      DECISAO: request.decisao,
    });
  }

  /**
   * As carteiras mudam no período letivo de `ano` (PRJ4087040), e a transferência vai para o histórico
   * (PRJ4987648), com a justificativa quando o destino passa do limite da regra de ocupação.
   */
  transferirCarteira(request: {
    codUsuario: string;
    origem: { codFilial: number; codBloco: string; codPredio: string; codSala: string };
    destino: { codFilial: number; codBloco: string; codPredio: string; codSala: string };
    quantidade: number;
    ano: string;
    justificativa?: string;
  }): Observable<{ sucesso: number }> {
    return this.http.post<{ sucesso: number }>(`${this.baseUrl}/OC_SAL_CARTEIRA_TRANSFERIR`, {
      CODUSUARIO: request.codUsuario,
      CODFILIALORIGEM: String(request.origem.codFilial),
      CODBLOCOORIGEM: request.origem.codBloco,
      CODPREDIOORIGEM: request.origem.codPredio,
      CODSALAORIGEM: request.origem.codSala,
      CODFILIALDESTINO: String(request.destino.codFilial),
      CODBLOCODESTINO: request.destino.codBloco,
      CODPREDIODESTINO: request.destino.codPredio,
      CODSALADESTINO: request.destino.codSala,
      QUANTIDADE: request.quantidade,
      ANO: request.ano,
      ...(request.justificativa ? { JUSTIFICATIVA: request.justificativa } : {}),
    });
  }

  /**
   * Marca a sala como indisponível no ano, com o motivo (MOTIVO do PRJ4087040, até 500 caracteres),
   * ou, com o motivo vazio, volta a deixá-la disponível. Devolve o motivo gravado (null = disponível).
   */
  definirIndisponibilidade(request: {
    codUsuario: string;
    ano: string;
    codFilial: number;
    codBloco: string;
    codPredio: string;
    codSala: string;
    motivo: string;
  }): Observable<{ motivo: string | null }> {
    return this.http.post<{ motivo: string | null }>(`${this.baseUrl}/OC_SAL_SALA_INDISPONIBILIDADE`, {
      CODUSUARIO: request.codUsuario,
      ANO: request.ano,
      CODFILIAL: String(request.codFilial),
      CODBLOCO: request.codBloco,
      CODPREDIO: request.codPredio,
      CODSALA: request.codSala,
      MOTIVO: request.motivo,
    });
  }

  /**
   * Plano da cópia de um ano letivo para outro: o que cada sala vira no destino (não grava). Com
   * `anoDestino` vazio, só as salas da origem, como "sem-destino".
   */
  getPlanoCopiaAno(codUsuario: string, anoOrigem: string, anoDestino: string): Observable<ApiCopiaAnoPlanoDto> {
    return this.http.post<ApiCopiaAnoPlanoDto>(`${this.baseUrl}/OC_SAL_COPIAR_ANO_PLANO`, {
      CODUSUARIO: codUsuario,
      ANOORIGEM: anoOrigem,
      ANODESTINO: anoDestino,
    });
  }

  /** Copia um lote de salas do plano (Ids de origem no PRJ4087040) para o ano de destino. */
  copiarSalasDoAno(
    codUsuario: string,
    anoOrigem: string,
    anoDestino: string,
    ids: string[],
  ): Observable<ApiCopiaSalaResultadoDto[]> {
    return this.http.post<ApiCopiaSalaResultadoDto[]>(`${this.baseUrl}/OC_SAL_COPIAR_ANO_SALAS`, {
      CODUSUARIO: codUsuario,
      ANOORIGEM: anoOrigem,
      ANODESTINO: anoDestino,
      IDS: ids,
    });
  }

  /** Para o formulário de sala nova: as unidades do usuário (anos, prédio e bloco, salas já cadastradas) e os tipos de sala. */
  getOpcoesSalaNova(codUsuario: string): Observable<ApiSalaNovaOpcoesDto> {
    return this.http.post<ApiSalaNovaOpcoesDto>(`${this.baseUrl}/OC_SAL_SALA_NOVA_OPCOES`, { CODUSUARIO: codUsuario });
  }

  /** Cria a sala no cadastro do RM e nos anos letivos marcados (só no TTESTE, por enquanto). */
  criarSala(codUsuario: string, sala: SalaNovaPedido): Observable<ApiSalaCriadaDto> {
    return this.http.post<ApiSalaCriadaDto>(`${this.baseUrl}/OC_SAL_SALA_CRIAR`, {
      CODUSUARIO: codUsuario,
      CODFILIAL: sala.codFilial,
      CODPREDIO: sala.codPredio,
      CODBLOCO: sala.codBloco,
      CODSALA: sala.codSala,
      DESCRICAO: sala.descricao,
      CODTIPOSALA: sala.codTipoSala,
      ANDAR: sala.andar,
      AREA: sala.area,
      CAPACIDADE: sala.capacidade,
      CARTEIRAS: sala.carteiras,
      ANOS: sala.anos,
      EXISTENTE: sala.existente,
    });
  }
}
