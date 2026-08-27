import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
}

let nextId = 0;

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="saea-field">
      @if (label()) {
        <label class="saea-field-label" [for]="fieldId">{{ label() }}</label>
      }
      <div class="saea-select-wrap">
        <select
          [id]="fieldId"
          class="saea-select-control"
          [class.saea-select-control--error]="!!error()"
          [disabled]="disabled()"
          [ngModel]="value"
          (ngModelChange)="onSelect($event)"
          (blur)="onTouched()"
        >
          @for (opt of options(); track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>
        <span class="saea-select-arrow">▾</span>
      </div>
      @if (error()) {
        <div class="saea-field-error">{{ error() }}</div>
      } @else if (helper()) {
        <div class="saea-field-helper">{{ helper() }}</div>
      }
    </div>
  `,
  styleUrl: './select.component.css',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true,
    },
  ],
})
export class SelectComponent implements ControlValueAccessor {
  readonly fieldId = `saea-select-${nextId++}`;
  readonly label = input<string>('');
  readonly options = input<SelectOption[]>([]);
  readonly error = input<string>('');
  readonly helper = input<string>('');
  readonly disabled = input(false);

  value = '';
  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  onSelect(value: string): void {
    this.value = value;
    this.onChange(value);
  }

  writeValue(value: string): void {
    this.value = value ?? '';
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
}
