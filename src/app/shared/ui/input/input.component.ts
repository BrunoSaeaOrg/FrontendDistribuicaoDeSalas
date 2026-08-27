import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextId = 0;

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="saea-field">
      @if (label()) {
        <label class="saea-field-label" [for]="fieldId">{{ label() }}</label>
      }
      <input
        [id]="fieldId"
        class="saea-field-control"
        [class.saea-field-control--error]="!!error()"
        [type]="type()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [ngModel]="value"
        (ngModelChange)="onInput($event)"
        (blur)="onTouched()"
      />
      @if (error()) {
        <div class="saea-field-error">{{ error() }}</div>
      } @else if (helper()) {
        <div class="saea-field-helper">{{ helper() }}</div>
      }
    </div>
  `,
  styleUrl: './input.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true,
    },
  ],
})
export class InputComponent implements ControlValueAccessor {
  readonly fieldId = `saea-input-${nextId++}`;
  readonly label = input<string>('');
  readonly placeholder = input<string>('');
  readonly type = input<string>('text');
  readonly error = input<string>('');
  readonly helper = input<string>('');
  readonly disabled = input(false);

  value: string | number = '';
  private onChange: (value: string | number) => void = () => {};
  onTouched: () => void = () => {};

  onInput(value: string | number): void {
    this.value = value;
    this.onChange(value);
  }

  writeValue(value: string | number): void {
    this.value = value ?? '';
  }
  registerOnChange(fn: (value: string | number) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
}
