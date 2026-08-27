import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (title() || subtitle()) {
      <div class="saea-card-header">
        @if (title()) {
          <div class="saea-card-title">{{ title() }}</div>
        }
        @if (subtitle()) {
          <div class="saea-card-subtitle">{{ subtitle() }}</div>
        }
      </div>
    }
    <div class="saea-card-body" [class.saea-card-body--with-header]="title() || subtitle()">
      <ng-content />
    </div>
    <ng-content select="[card-footer]" />
  `,
  styleUrl: './card.component.css',
})
export class CardComponent {
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
}
