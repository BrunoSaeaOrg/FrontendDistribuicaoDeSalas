import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth/auth.service';
import { BreakpointService } from '../../core/services/breakpoint.service';
import { LAYOUTS, LayoutApp, LayoutService } from '../../core/services/layout.service';
import { UsuarioService } from '../../core/services/usuario.service';

/**
 * Avatar de quem está logado, com o "Sair" dentro (o mesmo jeito do portal SAEA): clicar na
 * foto abre o menu. A foto vem da FV.APP.DESKUSER; sem ela, ficam as iniciais. Vai logo
 * depois do switch de tema, no cabeçalho do desktop e no do celular.
 */
@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="saea-header-avatar"
      type="button"
      aria-haspopup="menu"
      [attr.aria-expanded]="menuAberto()"
      [attr.aria-label]="'Menu de ' + nomeCompleto()"
      [title]="nomeCompleto()"
      (click)="menuAberto.set(!menuAberto())"
    >
      @if (foto(); as src) {
        <img [src]="src" alt="" (error)="fotoComErro.set(src)" />
      } @else {
        {{ iniciais() }}
      }
    </button>
    @if (menuAberto()) {
      <div class="saea-header-menu" role="menu">
        <!-- Os layouts só mudam o desktop (o mobile não tem menu lateral). -->
        @if (!breakpoint.isMobile()) {
          <div class="saea-header-menu-grupo">Layout</div>
          @for (opcao of layouts; track opcao.valor) {
            <button
              type="button"
              role="menuitemradio"
              [attr.aria-checked]="layout.layout() === opcao.valor"
              (click)="escolherLayout(opcao.valor)"
            >
              <mat-icon>{{ layout.layout() === opcao.valor ? 'radio_button_checked' : 'radio_button_unchecked' }}</mat-icon>
              {{ opcao.nome }}
            </button>
          }
          <div class="saea-header-menu-divisor" role="separator"></div>
        }
        <button type="button" role="menuitem" (click)="sair()">
          <mat-icon>logout</mat-icon> Sair
        </button>
      </div>
    }
  `,
  styleUrl: './user-avatar.component.css',
})
export class UserAvatarComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly authService = inject(AuthService);
  private readonly usuario = inject(UsuarioService);
  readonly breakpoint = inject(BreakpointService);
  readonly layout = inject(LayoutService);
  readonly layouts = LAYOUTS;

  readonly menuAberto = signal(false);

  /** Foto que o navegador não conseguiu abrir: o avatar volta para as iniciais. */
  readonly fotoComErro = signal<string | null>(null);

  readonly foto = computed(() => {
    const foto = this.usuario.foto();
    return foto && foto !== this.fotoComErro() ? foto : null;
  });

  /** Nome completo do RM no title e no aria-label; sem ele, o login formatado. */
  readonly nomeCompleto = computed(() => this.usuario.nome() ?? this.identidade());

  /**
   * "BRUNO OLIVEIRA SANTOS" vira "BS". Ficam vazias enquanto a consulta não respondeu,
   * senão o avatar piscaria das letras do login para as do nome do RM.
   */
  readonly iniciais = computed(() => {
    if (this.usuario.status() === 'carregando') return '';
    const partes = this.nomeCompleto().split(/\s+/).filter(Boolean);
    if (!partes.length) return '';
    const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2);
    return letras.toLocaleUpperCase('pt-BR');
  });

  // Reserva para quando a FV.APP.DESKUSER falha: o login devolve em "nome" o nome do token do
  // RM ou o próprio login (ex.: "bruno.oliveira"), que vira "Bruno Oliveira". Nome com
  // espaços passa intacto.
  private readonly identidade = computed(() => {
    const user = this.authService.currentUser();
    const nome = (user?.nome || user?.username || '').trim();
    if (!nome) return 'Usuário';
    if (/\s/.test(nome)) return nome;
    return nome
      .split(/[._-]+/)
      .filter(Boolean)
      .map((parte) => parte.charAt(0).toLocaleUpperCase('pt-BR') + parte.slice(1))
      .join(' ');
  });

  @HostListener('document:click', ['$event'])
  fecharMenuAoClicarFora(event: MouseEvent): void {
    if (!this.menuAberto()) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.menuAberto.set(false);
  }

  @HostListener('document:keydown.escape')
  fecharMenuComEsc(): void {
    this.menuAberto.set(false);
  }

  escolherLayout(layout: LayoutApp): void {
    this.menuAberto.set(false);
    this.layout.escolher(layout);
  }

  /** O logout do AuthService já leva para /login. */
  sair(): void {
    this.menuAberto.set(false);
    this.authService.logout();
  }
}
