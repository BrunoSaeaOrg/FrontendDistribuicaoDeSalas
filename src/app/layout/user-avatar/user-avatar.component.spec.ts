import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthUser } from '../../core/auth/auth.model';
import { AuthService } from '../../core/auth/auth.service';
import { StatusUsuario, UsuarioService } from '../../core/services/usuario.service';
import { UserAvatarComponent } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  const status = signal<StatusUsuario>('ok');
  const nome = signal<string | null>('BRUNO OLIVEIRA SANTOS');
  const foto = signal<string | null>(null);
  const currentUser = signal<AuthUser | null>({
    id: 'bruno.oliveira',
    nome: 'bruno.oliveira',
    email: '',
    username: 'bruno.oliveira',
  });
  const logout = vi.fn();

  let fixture: ComponentFixture<UserAvatarComponent>;
  let el: HTMLElement;

  const avatar = () => el.querySelector<HTMLButtonElement>('.saea-header-avatar')!;
  const menu = () => el.querySelector<HTMLElement>('.saea-header-menu');

  function render(): void {
    fixture.detectChanges();
  }

  beforeEach(() => {
    status.set('ok');
    nome.set('BRUNO OLIVEIRA SANTOS');
    foto.set(null);
    logout.mockClear();

    TestBed.configureTestingModule({
      imports: [UserAvatarComponent],
      providers: [
        { provide: UsuarioService, useValue: { status, nome, foto } },
        { provide: AuthService, useValue: { currentUser, logout } },
      ],
    });
    fixture = TestBed.createComponent(UserAvatarComponent);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    render();
  });

  afterEach(() => el.remove());

  it('sem foto mostra as iniciais da primeira e da última palavra', () => {
    expect(avatar().textContent?.trim()).toBe('BS');
    expect(avatar().title).toBe('BRUNO OLIVEIRA SANTOS');
    expect(avatar().getAttribute('aria-label')).toBe('Menu de BRUNO OLIVEIRA SANTOS');
  });

  it('com uma palavra só usa as duas primeiras letras', () => {
    nome.set('BRUNO');
    render();
    expect(avatar().textContent?.trim()).toBe('BR');
  });

  it('enquanto a consulta não respondeu o círculo fica vazio', () => {
    status.set('carregando');
    nome.set(null);
    render();
    expect(avatar().textContent?.trim()).toBe('');
    expect(avatar().querySelector('img')).toBeNull();
  });

  it('se a consulta falhou as iniciais saem do login formatado', () => {
    status.set('indisponivel');
    nome.set(null);
    render();
    expect(avatar().textContent?.trim()).toBe('BO');
    expect(avatar().title).toBe('Bruno Oliveira');
  });

  it('com foto mostra a imagem e volta para as iniciais se ela não abrir', () => {
    foto.set('data:image/jpeg;base64,/9j/4AAQ');
    render();
    const img = avatar().querySelector('img')!;
    expect(img.getAttribute('src')).toBe('data:image/jpeg;base64,/9j/4AAQ');

    img.dispatchEvent(new Event('error'));
    render();
    expect(avatar().querySelector('img')).toBeNull();
    expect(avatar().textContent?.trim()).toBe('BS');
  });

  it('clicar na foto abre o menu só com o Sair', () => {
    expect(menu()).toBeNull();
    avatar().click();
    render();

    expect(avatar().getAttribute('aria-expanded')).toBe('true');
    const itens = menu()!.querySelectorAll('[role="menuitem"]');
    expect(itens.length).toBe(1);
    expect(itens[0].textContent).toContain('Sair');
  });

  it('o menu fecha ao clicar fora e com Esc', () => {
    avatar().click();
    render();
    document.body.click();
    render();
    expect(menu()).toBeNull();

    avatar().click();
    render();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    render();
    expect(menu()).toBeNull();
  });

  it('Sair fecha o menu e desloga', () => {
    avatar().click();
    render();
    menu()!.querySelector<HTMLButtonElement>('[role="menuitem"]')!.click();
    render();

    expect(logout).toHaveBeenCalledTimes(1);
    expect(menu()).toBeNull();
  });
});
