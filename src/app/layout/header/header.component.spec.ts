import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { LayoutService } from '../../core/services/layout.service';
import { StatusUsuario, UsuarioService } from '../../core/services/usuario.service';
import { HeaderComponent } from './header.component';

describe('HeaderComponent', () => {
  const nome = signal<string | null>(null);
  const primeiroNome = signal<string | null>(null);
  const status = signal<StatusUsuario>('carregando');

  function render(): HTMLElement {
    const fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  beforeEach(() => {
    nome.set(null);
    primeiroNome.set(null);
    status.set('carregando');
    TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        { provide: UsuarioService, useValue: { nome, primeiroNome, status, foto: signal(null) } },
        { provide: AuthService, useValue: { currentUser: signal(null), logout: vi.fn() } },
      ],
    });
  });

  it('saúda pelo primeiro nome, com o nome completo no title', () => {
    nome.set('BRUNO HENRIQUE SANTOS');
    primeiroNome.set('Bruno');
    status.set('ok');
    const saudacao = render().querySelector<HTMLElement>('.saea-header-title')!;

    expect(saudacao.textContent?.trim()).toMatch(/^(Bom dia|Boa tarde|Boa noite), Bruno$/);
    expect(saudacao.title).toBe('BRUNO HENRIQUE SANTOS');
  });

  it('sem o nome fica só a saudação, sem vírgula sobrando', () => {
    const saudacao = render().querySelector<HTMLElement>('.saea-header-title')!;
    expect(saudacao.textContent?.trim()).toMatch(/^(Bom dia|Boa tarde|Boa noite)$/);
    expect(saudacao.hasAttribute('title')).toBe(false);
  });

  it('no layout "Barra lateral" fica só o primeiro nome, sem a saudação', () => {
    TestBed.overrideProvider(LayoutService, { useValue: { layout: signal('lateral') } });
    nome.set('BRUNO HENRIQUE SANTOS');
    primeiroNome.set('Bruno');
    status.set('ok');
    const header = render();
    const nomeAoLado = header.querySelector<HTMLElement>('.saea-header-actions .saea-header-title')!;

    expect(nomeAoLado.textContent?.trim()).toBe('Bruno');
    expect(nomeAoLado.title).toBe('BRUNO HENRIQUE SANTOS');
    // Switch, nome e foto, nessa ordem.
    expect(nomeAoLado.previousElementSibling?.tagName).toBe('SAEA-THEME-TOGGLE');
    expect(nomeAoLado.nextElementSibling?.tagName).toBe('APP-USER-AVATAR');
    expect(header.querySelector('.saea-header-app')?.textContent?.trim()).toBe('Ocupação de Salas');
    // Sobre a superfície da página o anel de foco do switch volta a ser o primário.
    expect(header.querySelector('saea-theme-toggle')!.classList).toContain('saea-theme-toggle--ghost');
  });

  it('o avatar vem logo depois do switch de tema', () => {
    const toggle = render().querySelector('saea-theme-toggle')!;
    expect(toggle.querySelector('[role="switch"]')).toBeTruthy();
    expect(toggle.nextElementSibling?.tagName).toBe('APP-USER-AVATAR');
    // Clássico: cabeçalho teal, anel de foco branco.
    expect(toggle.classList).toContain('saea-theme-toggle--on-primary');
  });
});
