import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { encryptLoginPayload, importRsaPublicKeyFromSpki, isLoginEncryptionSupported } from './login-encryption.util';
import {
  AuthUser,
  DadosUsuarioDto,
  EncryptionKeyResponse,
  LoginApiResponse,
  PasswordRecoveryResponse,
} from './auth.model';

const ACCESS_TOKEN_KEY = 'saea.accessToken';
const REFRESH_TOKEN_KEY = 'saea.refreshToken';
const USER_KEY = 'saea.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  private readonly _currentUser = signal<AuthUser | null>(this.readStoredUser());
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => !!this._currentUser());

  get accessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  login(usuario: string, senha: string): Observable<LoginApiResponse> {
    if (!isLoginEncryptionSupported()) {
      return throwError(
        () => new Error('Navegador sem suporte a criptografia (Web Crypto API). Use HTTPS ou um navegador atualizado.'),
      );
    }

    return this.performEncryptedLogin(usuario, senha).pipe(
      tap((response) => {
        if (response.success) {
          this.persistSession(response);
        }
      }),
    );
  }

  /**
   * Dados cadastrais do usuario logado (FV.APP.DESKUSER). O backend ignora o CODUSUARIO
   * abaixo e sempre usa o `sub` do JWT — ele so vai no body pra aparecer no Payload do
   * DevTools (debug visual de qual usuario esta sendo consultado).
   */
  dadosUsuario(): Observable<DadosUsuarioDto[]> {
    const codUsuario = this.currentUser()?.id ?? null;
    return this.http.post<DadosUsuarioDto[]>(`${this.baseUrl}/dados-usuario`, { CODUSUARIO: codUsuario });
  }

  /**
   * "Esqueceu sua senha?", etapa 1: o TOTVS manda o token de redefinição para o e-mail
   * cadastrado de `usuario` (CPF, e-mail ou login). A resposta é a mesma exista o usuário
   * ou não. Erros (429 do limite por minuto, 5xx) chegam com `message`.
   */
  requestPasswordRecovery(usuario: string): Observable<PasswordRecoveryResponse> {
    return this.http.post<PasswordRecoveryResponse>(`${this.baseUrl}/password/recovery`, { usuario });
  }

  /**
   * Etapa 2: troca a senha com o token do e-mail. `{ usuario, token, novaSenha }` vai cifrado
   * com a mesma chave efêmera do login. A recusa do TOTVS (token inválido, senha fora da
   * política) volta como 400 com a mensagem dele.
   */
  resetPassword(usuario: string, token: string, novaSenha: string): Observable<PasswordRecoveryResponse> {
    if (!isLoginEncryptionSupported()) {
      return throwError(
        () => new Error('Navegador sem suporte a criptografia (Web Crypto API). Use HTTPS ou um navegador atualizado.'),
      );
    }

    return this.http.get<EncryptionKeyResponse>(`${this.baseUrl}/encryption-key`).pipe(
      switchMap(({ keyId, publicKey }) =>
        from(importRsaPublicKeyFromSpki(publicKey)).pipe(
          switchMap((key) => from(encryptLoginPayload(key, { usuario, token, novaSenha }))),
          switchMap((payload) =>
            this.http.post<PasswordRecoveryResponse>(`${this.baseUrl}/password/reset`, { keyId, payload }),
          ),
        ),
      ),
    );
  }

  logout(): void {
    const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
    this.clearSession();

    if (refreshToken) {
      this.http.post(`${this.baseUrl}/logout`, { refreshToken }).pipe(
        catchError(() => of(null)),
      ).subscribe();
    }

    this.router.navigate(['/login']);
  }

  private performEncryptedLogin(usuario: string, senha: string): Observable<LoginApiResponse> {
    return this.http.get<EncryptionKeyResponse>(`${this.baseUrl}/encryption-key`).pipe(
      switchMap(({ keyId, publicKey }) =>
        from(importRsaPublicKeyFromSpki(publicKey)).pipe(
          switchMap((key) => from(encryptLoginPayload(key, { usuario, senha }))),
          switchMap((payload) => this.http.post<LoginApiResponse>(`${this.baseUrl}/login`, { keyId, payload })),
        ),
      ),
    );
  }

  private persistSession(response: LoginApiResponse): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, response.token);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this._currentUser.set(response.user);
  }

  private clearSession(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    this._currentUser.set(null);
  }

  private readStoredUser(): AuthUser | null {
    const raw = sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }
}
