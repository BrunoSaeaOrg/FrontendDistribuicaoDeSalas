import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';
import { UsuarioService } from '../../core/services/usuario.service';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

function saudacao(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="saea-header">
      <img class="saea-header-logo" src="assets/logo-header-white.png" alt="SAEA" />
      <div class="saea-header-titles">
        <div class="saea-header-title" [attr.title]="usuario.nome()">{{ greeting() }}</div>
        <div class="saea-header-subtitle">{{ subtitle() }}</div>
      </div>
      <button
        type="button"
        class="saea-theme-toggle"
        [attr.aria-label]="theme.isDark() ? 'Ativar tema claro' : 'Ativar tema escuro'"
        (click)="theme.toggle()"
      >
        <span class="saea-theme-icon">light_mode</span>
        <span class="saea-theme-icon">dark_mode</span>
        <span class="saea-theme-knob" [class.saea-theme-knob--dark]="theme.isDark()"></span>
      </button>
      <app-user-avatar />
    </header>
  `,
  styleUrl: './header.component.css',
})
export class HeaderComponent {
  readonly theme = inject(ThemeService);
  readonly usuario = inject(UsuarioService);
  readonly subtitle = input<string>('Ocupação de Salas');
  readonly saudacao = saudacao();

  readonly greeting = computed(() => {
    const nome = this.usuario.primeiroNome();
    return nome ? `${this.saudacao}, ${nome}` : this.saudacao;
  });
}
