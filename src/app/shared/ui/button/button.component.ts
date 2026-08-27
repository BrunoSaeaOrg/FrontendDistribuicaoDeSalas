import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

@Component({
  selector: 'app-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="saea-btn saea-btn--{{ variant() }} saea-btn--{{ size() }}"
      [disabled]="disabled()"
      (click)="clicked.emit($event)"
    >
      <ng-content />
    </button>
  `,
  styleUrl: './button.component.css',
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly disabled = input(false);
  readonly clicked = output<MouseEvent>();
}
