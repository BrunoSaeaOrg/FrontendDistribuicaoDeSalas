import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type AlertTone = 'success' | 'warning' | 'danger' | 'info' | 'primary';

const ICON_BY_TONE: Record<AlertTone, string> = {
  success: '✓',
  warning: '!',
  danger: '✕',
  info: 'i',
  primary: 'i',
};

@Component({
  selector: 'app-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="saea-alert saea-alert--{{ tone() }}">
      <span class="saea-alert-icon">{{ icon }}</span>
      <div class="saea-alert-content"><ng-content /></div>
    </div>
  `,
  styleUrl: './alert.component.css',
})
export class AlertComponent {
  readonly tone = input<AlertTone>('info');
  get icon(): string {
    return ICON_BY_TONE[this.tone()];
  }
}
