import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from '../../core/services/theme.service';
import { SidePanelItem } from '../side-panel/side-panel.component';

@Component({
  selector: 'app-mobile-nav',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mobile-nav.component.html',
  styleUrl: './mobile-nav.component.css',
})
export class MobileNavComponent {
  readonly theme = inject(ThemeService);

  readonly title = input('Distribuição de Salas');
  readonly currentLabel = input('Painel');
  readonly items = input<SidePanelItem[]>([]);
  readonly activeRoute = input<string>('');
  readonly signOutLabel = input('Sair');

  readonly itemClick = output<SidePanelItem>();
  readonly signOut = output<void>();

  readonly open = signal(false);

  onItemClick(item: SidePanelItem): void {
    this.open.set(false);
    this.itemClick.emit(item);
  }

  onSignOut(): void {
    this.open.set(false);
    this.signOut.emit();
  }
}
