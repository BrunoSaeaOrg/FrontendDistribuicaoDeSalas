import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ToastMessage } from '../../../core/services/toast.service';

const ICON_BY_TONE: Record<ToastMessage['tone'], string> = {
  success: '✓',
  warning: '!',
  danger: '✕',
  info: 'i',
};

@Component({
  selector: 'app-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="saea-toast">
      <span class="saea-toast-icon saea-toast-icon--{{ toast().tone }}">{{ icon }}</span>
      <div>
        <div class="saea-toast-title">{{ toast().title }}</div>
        @if (toast().description) {
          <div class="saea-toast-description">{{ toast().description }}</div>
        }
      </div>
    </div>
  `,
  styleUrl: './toast.component.css',
})
export class ToastComponent {
  readonly toast = input.required<ToastMessage>();
  get icon(): string {
    return ICON_BY_TONE[this.toast().tone];
  }
}
