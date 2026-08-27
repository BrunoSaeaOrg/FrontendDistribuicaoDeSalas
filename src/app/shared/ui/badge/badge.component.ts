import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info';

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
