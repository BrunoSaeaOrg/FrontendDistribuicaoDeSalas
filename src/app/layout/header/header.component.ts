import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LayoutService } from '../../core/services/layout.service';
import { ThemeService } from '../../core/services/theme.service';
import { UsuarioService } from '../../core/services/usuario.service';
import { saudacao } from '../saudacao';
import { ThemeSwitchComponent } from '../theme-switch/theme-switch.component';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

/**
 * Cabeçalho do desktop, igual ao da Reserva de Salas: cor da moldura (--saea-chrome) sólida,
 * logo e ações presas nas pontas, saudação + nome do sistema no centro exato da barra. No
 * layout "Barra lateral" ele fica na superfície da página, com texto escuro e o selo.
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [ThemeSwitchComponent, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="saea-header">
      <div class="saea-header-left">
        <img class="saea-header-logo" [src]="logo()" alt="SAEA" />
      </div>
      <div class="saea-header-titles">
        <span class="saea-header-title" [attr.title]="usuario.nome()">{{ greeting() }}</span>
        <span class="saea-header-subtitle">{{ subtitle() }}</span>
      </div>
      <div class="saea-header-actions">
        <app-theme-switch />
        <app-user-avatar />
      </div>
    </header>
  `,
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  readonly usuario = inject(UsuarioService);
  readonly subtitle = input<string>('Ocupação de Salas');
  readonly saudacao = saudacao();

  private readonly layout = inject(LayoutService);
  private readonly theme = inject(ThemeService);

  /**
   * Layout "Barra lateral": o cabeçalho fica na superfície da página, então vai o selo sem o
   * nome SAEA, colorido no claro e branco no escuro (logo-white.png é o colorido com o azul em
   * branco e o fundo transparente), os dois do mesmo tamanho.
   */
  readonly logo = computed(() => {
    if (this.layout.layout() !== 'lateral') return 'assets/logo-header-white.png';
    return this.theme.isDark() ? 'assets/logo-white.png' : 'assets/logo-color.png';
  });

  readonly greeting = computed(() => {
    const nome = this.usuario.primeiroNome();
    return nome ? `${this.saudacao}, ${nome}` : this.saudacao;
  });
}
