import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="saea-empty">
      <span class="saea-empty-icon"><mat-icon>{{ icon() }}</mat-icon></span>
      <div class="saea-empty-title">{{ title() }}</div>
      @if (description()) {
        <div class="saea-empty-description">{{ description() }}</div>
      }
      <ng-content select="[action]" />
    </div>
  `,
  styleUrl: './empty-state.component.css',
})
export class EmptyStateComponent {
  readonly icon = input('inbox');
  readonly title = input.required<string>();
  readonly description = input<string>('');
}
