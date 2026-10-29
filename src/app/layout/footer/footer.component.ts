import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { SaeaThemeService } from '@sistemas-saea/saea-design-system';

@Component({
  selector: 'app-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="saea-footer">
      <img
        class="saea-footer-logo"
        [src]="theme.isDark() ? 'assets/logo-header-white.png' : 'assets/logo-color.png'"
        alt="SAEA"
      />
      <span class="saea-footer-text">© {{ year() }} · DESENVOLVIDO POR <b>{{ org() }}</b></span>
    </footer>
  `,
  styleUrl: './footer.component.css',
})
export class FooterComponent {
  readonly theme = inject(SaeaThemeService);
  readonly year = input(new Date().getFullYear());
  readonly org = input('SISTEMAS SAEA');
}
