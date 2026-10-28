import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ThemeService } from '../../core/services/theme.service';

/**
 * Switch claro/escuro do cabeçalho, igual ao da Reserva de Salas (e do Agenda Viagens):
 * trilho translúcido pensado para o fundo teal, sol e lua nas pontas, bolinha branca.
 */
@Component({
  selector: 'app-theme-switch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="switch-track"
      [class.dark]="theme.isDark()"
      role="switch"
      [attr.aria-checked]="theme.isDark()"
      aria-label="Alternar tema claro/escuro"
      [title]="theme.isDark() ? 'Mudar para tema claro' : 'Mudar para tema escuro'"
      (click)="theme.toggle()"
    >
      <span class="switch-icon sun" aria-hidden="true">light_mode</span>
      <span class="switch-icon moon" aria-hidden="true">dark_mode</span>
      <span class="switch-handle"></span>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    .switch-track {
      position: relative;
      flex: none;
      display: inline-flex;
      align-items: center;
      width: 44px;
      height: 24px;
      padding: 0 3px;
      border: none;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.14);
      cursor: pointer;
      transition: background-color 0.22s var(--ease-in-out, ease-in-out);
    }
    .switch-track:hover {
      background: rgba(255, 255, 255, 0.24);
    }
    .switch-track:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }
    .switch-track:active .switch-handle {
      filter: brightness(0.92);
    }
    .switch-track.dark {
      background: rgba(255, 255, 255, 0.22);
    }
    .switch-icon {
      position: relative;
      z-index: 1;
      flex: none;
      width: 13px;
      height: 13px;
      font-family: 'Material Icons';
      font-size: 13px;
      line-height: 13px;
      color: rgba(255, 255, 255, 0.55);
      transition: color 0.22s var(--ease-in-out, ease-in-out);
    }
    .switch-icon.sun {
      margin-right: auto;
    }
    .switch-icon.moon {
      margin-left: auto;
    }
    .switch-track:not(.dark) .switch-icon.sun,
    .switch-track.dark .switch-icon.moon {
      color: #fff;
    }
    .switch-handle {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      transition:
        transform 0.22s var(--ease-in-out, ease-in-out),
        filter 0.12s ease;
    }
    .switch-track.dark .switch-handle {
      transform: translateX(20px);
    }
  `,
})
export class ThemeSwitchComponent {
  readonly theme = inject(ThemeService);
}
