import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ToastService } from '../services/toast.service';
import { AuthUser, LoginApiResponse } from './auth.model';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const USUARIO: AuthUser = { id: 'bruno.santos', nome: 'bruno.santos', email: '', username: 'bruno.santos' };
const URL_SALAS = `${environment.apiUrl}/OcupacaoSalas/salas`;
const URL_REFRESH = `${environment.apiUrl}/auth/refresh`;

function sessao(token: string, refreshToken: string): LoginApiResponse {
  return { success: true, message: '', token, refreshToken, expiresAt: '', user: { ...USUARIO } };
}

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', children: [] }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
    auth['persistSession'](sessao('token-vencido', 'refresh-1'));
  });

  afterEach(() => http.verify());

  it('com 401, renova o token e repete a chamada com o token novo', () => {
    let resposta: unknown;
    client.get(URL_SALAS).subscribe((r) => (resposta = r));

    http.expectOne(URL_SALAS).flush({ message: 'expirado' }, { status: 401, statusText: 'Unauthorized' });

    const refresh = http.expectOne(URL_REFRESH);
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush(sessao('token-novo', 'refresh-2'));

    const repetida = http.expectOne(URL_SALAS);
    expect(repetida.request.headers.get('Authorization')).toBe('Bearer token-novo');
    repetida.flush([{ SALA: 'Sala 1' }]);

    expect(resposta).toEqual([{ SALA: 'Sala 1' }]);
    expect(auth.accessToken).toBe('token-novo');
    expect(sessionStorage.getItem('saea.refreshToken')).toBe('refresh-2');
    expect(auth.currentUser()?.id).toBe('bruno.santos');
  });

  it('duas chamadas com 401 ao mesmo tempo fazem um refresh só', () => {
    client.get(URL_SALAS).subscribe();
    client.get(URL_SALAS, { params: { outra: 1 } }).subscribe();

    for (const req of http.match((r) => r.url === URL_SALAS)) {
      req.flush({}, { status: 401, statusText: 'Unauthorized' });
    }

    http.expectOne(URL_REFRESH).flush(sessao('token-novo', 'refresh-2'));
    for (const req of http.match((r) => r.url === URL_SALAS)) {
      expect(req.request.headers.get('Authorization')).toBe('Bearer token-novo');
      req.flush([]);
    }
  });

  it('se o refresh também falhar, encerra a sessão e volta para o login', () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const avisar = vi.spyOn(TestBed.inject(ToastService), 'warning');
    let status = 0;
    client.get(URL_SALAS).subscribe({ error: (e) => (status = e.status) });

    http.expectOne(URL_SALAS).flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(URL_REFRESH).flush({ message: 'Refresh token inválido ou expirado.' }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(auth.currentUser()).toBeNull();
    expect(auth.accessToken).toBeNull();
    expect(navegar).toHaveBeenCalledWith(['/login']);
    expect(avisar).toHaveBeenCalledWith('Sua sessão expirou', 'Entre de novo para continuar.');
  });

  it('erro que não é 401 passa direto, sem refresh', () => {
    let status = 0;
    client.get(URL_SALAS).subscribe({ error: (e) => (status = e.status) });

    http.expectOne(URL_SALAS).flush({}, { status: 500, statusText: 'Server Error' });

    expect(status).toBe(500);
    http.expectNone(URL_REFRESH);
  });
});
