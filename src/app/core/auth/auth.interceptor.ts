import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

/** Rotas publicas de /auth/ que nunca devem levar o token atual (login, refresh, logout, etc). */
const PUBLIC_AUTH_PATHS = ['/auth/encryption-key', '/auth/login', '/auth/refresh', '/auth/logout', '/auth/password/'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken;

  const isPublicAuthRoute = PUBLIC_AUTH_PATHS.some((path) => req.url.includes(path));
  if (!token || isPublicAuthRoute) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
