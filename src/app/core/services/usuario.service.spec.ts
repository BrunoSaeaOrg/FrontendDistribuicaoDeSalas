import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthUser, LoginApiResponse } from '../auth/auth.model';
import { AuthService } from '../auth/auth.service';
import { UsuarioService } from './usuario.service';

const URL_DADOS = `${environment.apiUrl}/auth/dados-usuario`;
const USUARIO: AuthUser = { id: 'bruno.santos', nome: 'bruno.santos', email: '', username: 'bruno.santos' };

describe('UsuarioService', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let usuario: UsuarioService;

  /** Mesmo caminho do login de verdade: grava a sessão e troca o currentUser. */
  function entrar(user: AuthUser = USUARIO): void {
    const resposta: LoginApiResponse = {
      success: true,
      message: '',
      token: 'token',
      refreshToken: '',
      expiresAt: '',
      user: { ...user },
    };
    auth['persistSession'](resposta);
    TestBed.tick();
  }

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([{ path: 'login', children: [] }])],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    usuario = TestBed.inject(UsuarioService);
    TestBed.tick();
  });

  afterEach(() => http.verify());

  it('sem sessão não consulta nada', () => {
    http.expectNone(URL_DADOS);
    expect(usuario.status()).toBe('indisponivel');
    expect(usuario.nome()).toBeNull();
  });

  it('com sessão consulta pelo CODUSUARIO e guarda o primeiro registro', () => {
    entrar();
    const req = http.expectOne(URL_DADOS);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ CODUSUARIO: 'bruno.santos' });
    expect(usuario.status()).toBe('carregando');

    req.flush([{ NOME: '  BRUNO HENRIQUE SANTOS ' }, { NOME: 'OUTRA PESSOA' }]);

    expect(usuario.status()).toBe('ok');
    expect(usuario.nome()).toBe('BRUNO HENRIQUE SANTOS');
    expect(usuario.primeiroNome()).toBe('Bruno');
  });

  it('capitaliza só a inicial, preservando acento', () => {
    entrar();
    http.expectOne(URL_DADOS).flush([{ NOME: 'ÉRICA SOUZA' }]);
    expect(usuario.primeiroNome()).toBe('Érica');
  });

  it.each([
    ['NOME vazio', [{ NOME: '   ' }]],
    ['NOME ausente', [{}]],
    ['lista vazia', []],
    ['corpo que não é array', { erro: 'SQL inválido' }],
  ])('%s deixa nome e primeiroNome nulos', (_caso, corpo) => {
    entrar();
    http.expectOne(URL_DADOS).flush(corpo);
    expect(usuario.nome()).toBeNull();
    expect(usuario.primeiroNome()).toBeNull();
    expect(usuario.status()).toBe('indisponivel');
  });

  it('erro HTTP vira null sem lançar nem derrubar a sessão', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    entrar();
    http.expectOne(URL_DADOS).flush('falhou', { status: 500, statusText: 'Server Error' });

    expect(usuario.nome()).toBeNull();
    expect(usuario.status()).toBe('indisponivel');
    expect(auth.isAuthenticated()).toBe(true);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('logout com a consulta em andamento cancela a requisição e zera os dados', () => {
    entrar();
    const req = http.expectOne(URL_DADOS);

    auth.logout();
    TestBed.tick();

    expect(req.cancelled).toBe(true);
    expect(usuario.nome()).toBeNull();
    expect(usuario.foto()).toBeNull();
    expect(usuario.status()).toBe('indisponivel');
  });

  it('novo login com o mesmo usuário consulta de novo', () => {
    entrar();
    http.expectOne(URL_DADOS).flush([{ NOME: 'BRUNO SANTOS' }]);

    entrar();
    expect(usuario.nome()).toBeNull();
    http.expectOne(URL_DADOS).flush([{ NOME: 'BRUNO SANTOS' }]);
    expect(usuario.nome()).toBe('BRUNO SANTOS');
  });

  describe('foto', () => {
    it.each([
      ['Base64 JPEG', '/9j/4AAQSkZJRg', 'data:image/jpeg;base64,/9j/4AAQSkZJRg'],
      ['Base64 PNG', 'iVBORw0KGgoAAAANSUhEUg', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg'],
      ['Base64 GIF', 'R0lGODlhAQAB', 'data:image/gif;base64,R0lGODlhAQAB'],
      ['Base64 WebP', 'UklGRiQAAABXRUJQ', 'data:image/webp;base64,UklGRiQAAABXRUJQ'],
      ['Base64 BMP', 'Qk02AAAA', 'data:image/bmp;base64,Qk02AAAA'],
      ['Base64 sem assinatura conhecida', 'AAAABBBB', 'data:image/jpeg;base64,AAAABBBB'],
      ['data URL pronta', 'data:image/png;base64,iVBOR', 'data:image/png;base64,iVBOR'],
      ['URL http(s)', 'https://portal.saea.org.br/foto.jpg', 'https://portal.saea.org.br/foto.jpg'],
    ])('%s vira um src de imagem', (_caso, foto, src) => {
      entrar();
      http.expectOne(URL_DADOS).flush([{ NOME: 'BRUNO SANTOS', FOTO: `  ${foto} ` }]);
      expect(usuario.foto()).toBe(src);
    });

    it.each([
      ['nula', null],
      ['vazia', '   '],
      ['ausente', undefined],
    ])('FOTO %s fica null', (_caso, foto) => {
      entrar();
      http.expectOne(URL_DADOS).flush([{ NOME: 'BRUNO SANTOS', FOTO: foto }]);
      expect(usuario.foto()).toBeNull();
    });
  });
});
