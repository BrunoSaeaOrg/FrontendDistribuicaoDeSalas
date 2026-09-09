import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, Observable, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { encryptLoginPayload, importRsaPublicKeyFromSpki, isLoginEncryptionSupported } from './login-encryption.util';
import { AuthUser, EncryptionKeyResponse, LoginApiResponse } from './auth.model';

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
