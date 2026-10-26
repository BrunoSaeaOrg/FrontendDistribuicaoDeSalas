import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
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

  it('o avatar vem logo depois do switch de tema', () => {
    const toggle = render().querySelector('.saea-theme-toggle')!;
    expect(toggle.nextElementSibling?.tagName).toBe('APP-USER-AVATAR');
  });
});
