import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ApiRegraDto,
  ApiSalaDto,
  ApiSolicitacaoDto,
  ApiStatusSolicitacao,
  ApiTurmaDto,
  ApiTurmaXSalaDto,
} from '../models/ocupacao-api.model';

@Injectable({ providedIn: 'root' })
export class OcupacaoApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/OcupacaoDeSalas`;

  getSalas(codUsuario: string): Observable<ApiSalaDto[]> {
    return this.http.post<ApiSalaDto[]>(`${this.baseUrl}/OC_SAL_SALAS`, {
      CODUSUARIO: codUsuario,
    });
  }

  getTurmasXSalas(codUsuario: string, ano: string): Observable<ApiTurmaXSalaDto[]> {
    return this.http.post<ApiTurmaXSalaDto[]>(`${this.baseUrl}/OC_SAL_TURMASXSALAS`, {
      CODUSUARIO: codUsuario,
      ANO: ano,
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
  }): Observable<{ Data?: string; CodRetorno?: number }> {
    return this.http.post<{ Data?: string; CodRetorno?: number }>(`${this.baseUrl}/OC_SAL_REGRAS_SALVAR`, {
      CODFILIAL: String(request.codFilial),
      // O TOTVS espera o decimal no formato brasileiro (1,5).
      AREAPORPESSOA: String(request.areaPorPessoa).replace('.', ','),
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
  }): Observable<{ sucesso: number }> {
    return this.http.post<{ sucesso: number }>(`${this.baseUrl}/OC_SAL_TURMASXSALAS_SALVAR`, {
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

  transferirCarteira(request: {
    codUsuario: string;
    origem: { codFilial: number; codBloco: string; codPredio: string; codSala: string };
    destino: { codFilial: number; codBloco: string; codPredio: string; codSala: string };
    quantidade: number;
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
    });
  }
}
