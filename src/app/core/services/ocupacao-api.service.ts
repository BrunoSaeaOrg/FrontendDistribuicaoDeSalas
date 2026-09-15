import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiSalaDto, ApiTurmaDto, ApiTurmaXSalaDto } from '../models/ocupacao-api.model';

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
      PERMEXCEDER: request.permExceder ? '1' : '0',
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
}
