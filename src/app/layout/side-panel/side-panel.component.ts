import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { LayoutApp } from '../../core/services/layout.service';

export interface SidePanelItem {
  icon: string;
  label: string;
  description?: string;
  route: string;
}

@Component({
  selector: 'app-side-panel',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="saea-side" [class.saea-side--collapsed]="collapsed()" [class.saea-side--lateral]="variante() === 'lateral'">
      <div class="saea-side-header" [class.saea-side-header--collapsed]="collapsed()">
        @if (!collapsed()) {
          <div class="saea-side-title">{{ title() }}</div>
        }
        <button
          type="button"
          class="saea-side-toggle"
          [attr.aria-label]="collapsed() ? 'Expandir' : 'Recolher'"
          (click)="toggle.emit()"
        >
          {{ collapsed() ? '›' : '‹' }}
        </button>
      </div>

      <nav class="saea-side-list">
        @for (item of items(); track item.route) {
          <button
            type="button"
            class="saea-side-item"
            [class.saea-side-item--active]="activeRoute() === item.route"
            [attr.title]="collapsed() ? item.label : null"
            (click)="itemClick.emit(item)"
          >
            <span class="saea-side-item-icon"><mat-icon>{{ item.icon }}</mat-icon></span>
            @if (!collapsed()) {
              <span class="saea-side-item-text">
                <span class="saea-side-item-label">{{ item.label }}</span>
                @if (item.description) {
                  <span class="saea-side-item-description">{{ item.description }}</span>
                }
              </span>
            }
          </button>
        }
      </nav>
    </aside>
  `,
  styleUrl: './side-panel.component.css',
})
export class SidePanelComponent {
  readonly title = input('Navegação');
  readonly items = input<SidePanelItem[]>([]);
  readonly collapsed = input(false);
  readonly activeRoute = input<string>('');
  /** Layout do app (LayoutService): "lateral" vira o bloco colado à esquerda, sem cartão. */
  readonly variante = input<LayoutApp>('padrao');

  readonly toggle = output<void>();
  readonly itemClick = output<SidePanelItem>();
}
