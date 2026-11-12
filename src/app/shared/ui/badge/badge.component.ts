import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** `neutral`: cinza, para o que está fora de uso (ex.: sala indisponível), distinto dos status de lotação. */
export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

@Component({
  selector: 'app-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="saea-badge saea-badge--{{ tone() }}"><ng-content /></span>`,
  styleUrl: './badge.component.css',
})
export class BadgeComponent {
  readonly tone = input<BadgeTone>('info');
}
