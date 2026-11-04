import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiAnoLetivoDto,
  ApiCopiaAnoPlanoDto,
  ApiCopiaSalaResultadoDto,
  ApiRegraDto,
  ApiRegraSalvaDto,
  ApiSalaDoAnoDto,
  ApiSolicitacaoDto,
  ApiStatusSolicitacao,
  ApiTurmaDto,
  ApiTurmaXSalaDto,
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

  /** As carteiras mudam no período letivo de `ano` (PRJ4087040), e a transferência vai para o histórico. */
  transferirCarteira(request: {
    codUsuario: string;
    origem: { codFilial: number; codBloco: string; codPredio: string; codSala: string };
    destino: { codFilial: number; codBloco: string; codPredio: string; codSala: string };
    quantidade: number;
    ano: string;
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
    });
  }

  /** Plano da cópia de um ano letivo para outro: o que cada sala e turma vira no destino (não grava). */
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
}
