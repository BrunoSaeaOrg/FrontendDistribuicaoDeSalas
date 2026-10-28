import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Rotas publicas de /auth/ que nunca devem levar o token atual (login, refresh, logout, etc). */
const PUBLIC_AUTH_PATHS = ['/auth/encryption-key', '/auth/login', '/auth/refresh', '/auth/logout', '/auth/password/'];

function comToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;

  const isPublicAuthRoute = PUBLIC_AUTH_PATHS.some((path) => req.url.includes(path));
  if (!token || isPublicAuthRoute) {
    return next(req);
  }

  return next(comToken(req, token)).pipe(
    catchError((erro: unknown) => {
      if (!(erro instanceof HttpErrorResponse) || erro.status !== 401) return throwError(() => erro);

      // Token vencido: renova uma vez e repete a chamada. Se nem o refresh valer mais, volta ao login.
      return auth.renovarSessao().pipe(
        catchError(() => {
          auth.encerrarSessaoExpirada();
          return throwError(() => erro);
        }),
        switchMap((novoToken) => next(comToken(req, novoToken))),
      );
    }),
  );
};
