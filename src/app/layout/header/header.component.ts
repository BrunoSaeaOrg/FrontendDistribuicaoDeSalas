import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { UsuarioService } from '../../core/services/usuario.service';
import { saudacao } from '../saudacao';
import { ThemeSwitchComponent } from '../theme-switch/theme-switch.component';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

/**
 * Cabeçalho do desktop, igual ao da Reserva de Salas: teal sólido, logo e ações presas nas
 * pontas, saudação + nome do sistema no centro exato da barra.
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [ThemeSwitchComponent, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="saea-header">
      <div class="saea-header-left">
        <img class="saea-header-logo" src="assets/logo-header-white.png" alt="SAEA" />
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

  readonly greeting = computed(() => {
    const nome = this.usuario.primeiroNome();
    return nome ? `${this.saudacao}, ${nome}` : this.saudacao;
  });
}
