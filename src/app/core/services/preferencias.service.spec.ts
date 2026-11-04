import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { SaeaThemeService } from '@sistemas-saea/saea-design-system';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.model';
import { LayoutService } from './layout.service';
import { chaveDoColaborador, lerPreferencias, PreferenciasService } from './preferencias.service';

@Component({ template: '' })
class Vazio {}

const colaborador = (username: string): AuthUser => ({ id: username, nome: username, email: '', username });
const ANA = '45497432808';
const BIA = '12345678900';

describe('PreferenciasService', () => {
  const usuario = signal<AuthUser | null>(null);
  let tema: SaeaThemeService;
  let layout: LayoutService;
  let router: Router;

  function iniciar(): void {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: Vazio },
          { path: 'painel', component: Vazio },
        ]),
        { provide: AuthService, useValue: { currentUser: usuario } },
      ],
    });
    TestBed.inject(PreferenciasService);
    tema = TestBed.inject(SaeaThemeService);
    layout = TestBed.inject(LayoutService);
    router = TestBed.inject(Router);
    TestBed.tick();
  }

  const entrar = (username: string | null) => {
    usuario.set(username ? colaborador(username) : null);
    TestBed.tick();
  };
  const tela = () => ({ layout: layout.layout(), escuro: tema.isDark(), html: document.documentElement.getAttribute('data-theme') });

  beforeEach(() => {
    localStorage.clear();
    usuario.set(null);
  });

  it('sem ninguém logado a tela é clara, mesmo com o escuro guardado pela biblioteca', () => {
    localStorage.setItem('saea-theme', 'dark');
    iniciar();
    expect(tela()).toEqual({ layout: 'padrao', escuro: false, html: 'light' });
  });

  it('guarda o layout e o tema do colaborador e devolve na próxima vez que ele entra', () => {
    iniciar();
    entrar(ANA);
    expect(tela()).toEqual({ layout: 'padrao', escuro: false, html: 'light' }); // nunca escolheu

    layout.escolher('lateral');
    tema.toggle();
    TestBed.tick();
    expect(lerPreferencias(ANA)).toEqual({ layout: 'lateral', tema: 'dark' });

    // Saiu: o login fica claro, e o que ela escolheu continua guardado.
    entrar(null);
    expect(tela().escuro).toBe(false);
    expect(lerPreferencias(ANA)).toEqual({ layout: 'lateral', tema: 'dark' });

    entrar(ANA);
    expect(tela()).toEqual({ layout: 'lateral', escuro: true, html: 'dark' });
  });

  it('cada colaborador tem as suas, e a chave não leva o login em texto', () => {
    iniciar();
    entrar(ANA);
    layout.escolher('lateral');
    tema.setMode('dark');
    TestBed.tick();

    entrar(null);
    entrar(BIA);
    expect(tela()).toEqual({ layout: 'padrao', escuro: false, html: 'light' });
    expect(lerPreferencias(ANA)).toEqual({ layout: 'lateral', tema: 'dark' });

    expect(chaveDoColaborador(ANA)).not.toContain(ANA);
    expect(chaveDoColaborador(ANA)).not.toBe(chaveDoColaborador(BIA));
    expect(Object.keys(localStorage).some((k) => k.includes(ANA))).toBe(false);
  });

  it('a rota de login fica clara mesmo com alguém logado, sem perder a escolha dele', async () => {
    iniciar();
    entrar(ANA);
    tema.setMode('dark');
    TestBed.tick();

    await router.navigateByUrl('/login');
    TestBed.tick();
    expect(tela().escuro).toBe(false);
    expect(lerPreferencias(ANA).tema).toBe('dark');

    await router.navigateByUrl('/painel');
    TestBed.tick();
    expect(tela().escuro).toBe(true);
  });

  it('apaga a chave antiga, de quando o layout era um só por navegador', () => {
    localStorage.setItem('saea.layout.distribuicao-salas', 'lateral');
    iniciar();
    expect(localStorage.getItem('saea.layout.distribuicao-salas')).toBeNull();
  });
});
