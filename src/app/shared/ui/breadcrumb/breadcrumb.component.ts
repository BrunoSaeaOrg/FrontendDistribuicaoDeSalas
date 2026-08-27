import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export interface BreadcrumbItem {
  label: string;
  icon?: string;
  onClick?: () => void;
}

@Component({
  selector: 'app-breadcrumb',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="saea-breadcrumb" aria-label="breadcrumb">
      @for (item of items(); track item.label; let last = $last) {
        @if (item.onClick && !last) {
          <button type="button" class="saea-breadcrumb-link" (click)="item.onClick()">
            @if (item.icon) {
              <mat-icon class="saea-breadcrumb-icon">{{ item.icon }}</mat-icon>
            }
            {{ item.label }}
          </button>
        } @else {
          <span class="saea-breadcrumb-item" [class.saea-breadcrumb-item--current]="last">
            {{ item.label }}
          </span>
        }
        @if (!last) {
          <span class="saea-breadcrumb-sep">/</span>
        }
      }
    </nav>
  `,
  styleUrl: './breadcrumb.component.css',
})
export class BreadcrumbComponent {
  readonly items = input<BreadcrumbItem[]>([]);
}
