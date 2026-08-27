import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-footer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <footer class="saea-footer">
      <img class="saea-footer-logo" src="assets/logo-color.png" alt="SAEA" />
      <span class="saea-footer-text">© {{ year() }} · Desenvolvido por {{ org() }}</span>
    </footer>
  `,
  styleUrl: './footer.component.css',
})
export class FooterComponent {
  readonly year = input(2026);
  readonly org = input('SISTEMAS SAEA');
}
