import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-switch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="saea-switch" [class.saea-switch--disabled]="disabled()">
      <span
        class="saea-switch-track"
        [class.saea-switch-track--checked]="checked()"
        role="switch"
        [attr.aria-checked]="checked()"
        [attr.aria-label]="label()"
        tabindex="0"
        (click)="toggle()"
        (keydown.enter)="toggle()"
        (keydown.space)="$event.preventDefault(); toggle()"
      >
        <span class="saea-switch-thumb"></span>
      </span>
      @if (label()) {
        <span class="saea-switch-label">{{ label() }}</span>
      }
    </label>
  `,
  styleUrl: './switch.component.css',
})
export class SwitchComponent {
  readonly label = input<string>('');
  readonly checked = input(false);
  readonly disabled = input(false);
  readonly checkedChange = output<boolean>();

  toggle(): void {
    if (this.disabled()) return;
    this.checkedChange.emit(!this.checked());
  }
}
