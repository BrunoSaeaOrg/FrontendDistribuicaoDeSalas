import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';
import { ToastComponent } from './toast.component';

@Component({
  selector: 'app-toast-stack',
  standalone: true,
  imports: [ToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="saea-toast-stack">
      @for (toast of toastService.toasts(); track toast.id) {
        <app-toast [toast]="toast" />
      }
    </div>
  `,
  styleUrl: './toast-stack.component.css',
})
export class ToastStackComponent {
  readonly toastService = inject(ToastService);
}
