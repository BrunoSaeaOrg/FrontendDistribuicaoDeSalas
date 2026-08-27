import { ChangeDetectionStrategy, Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="confirm-header">
      @if (data.danger) {
        <span class="confirm-icon"><mat-icon>warning</mat-icon></span>
      }
      <h2 class="confirm-title">{{ data.title }}</h2>
    </div>
    @if (data.description) {
      <p class="confirm-description">{{ data.description }}</p>
    }
    <div class="confirm-actions">
      <button type="button" class="confirm-btn confirm-btn--cancel" (click)="dialogRef.close(false)">
        {{ data.cancelLabel || 'Cancelar' }}
      </button>
      <button
        type="button"
        class="confirm-btn confirm-btn--confirm"
        [class.confirm-btn--danger]="data.danger"
        (click)="dialogRef.close(true)"
      >
        {{ data.confirmLabel || 'Confirmar' }}
      </button>
    </div>
  `,
  styleUrl: './confirm-dialog.component.css',
})
export class ConfirmDialogComponent {
  constructor(
    public readonly dialogRef: MatDialogRef<ConfirmDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public readonly data: ConfirmDialogData,
  ) {}
}
