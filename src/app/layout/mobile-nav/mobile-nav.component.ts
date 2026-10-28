import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { UsuarioService } from '../../core/services/usuario.service';
import { saudacao } from '../saudacao';
import { SidePanelItem } from '../side-panel/side-panel.component';
import { ThemeSwitchComponent } from '../theme-switch/theme-switch.component';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

@Component({
  selector: 'app-mobile-nav',
  standalone: true,
  imports: [MatIconModule, ThemeSwitchComponent, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mobile-nav.component.html',
  styleUrl: './mobile-nav.component.css',
})
export class MobileNavComponent {
  readonly usuario = inject(UsuarioService);

  readonly title = input('Ocupação de Salas');
  readonly currentLabel = input('Painel');
  readonly items = input<SidePanelItem[]>([]);
  readonly activeRoute = input<string>('');

  readonly itemClick = output<SidePanelItem>();

  readonly open = signal(false);

  private readonly saudacao = saudacao();

  readonly greeting = computed(() => {
    const nome = this.usuario.primeiroNome();
    return nome ? `${this.saudacao}, ${nome}` : this.saudacao;
  });

  onItemClick(item: SidePanelItem): void {
    this.open.set(false);
    this.itemClick.emit(item);
  }
}
