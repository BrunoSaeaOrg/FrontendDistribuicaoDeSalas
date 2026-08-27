import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RegrasService } from '../../core/services/regras.service';
import { ToastService } from '../../core/services/toast.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { AlertComponent } from '../../shared/ui/alert/alert.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { InputComponent } from '../../shared/ui/input/input.component';
import { SwitchComponent } from '../../shared/ui/switch/switch.component';

@Component({
  selector: 'app-regras',
  standalone: true,
  imports: [FormsModule, AlertComponent, ButtonComponent, CardComponent, InputComponent, SwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './regras.component.html',
  styleUrl: './regras.component.css',
})
export class RegrasComponent {
  readonly regrasService = inject(RegrasService);
  readonly uiMode = inject(UiModeService);
  private readonly toast = inject(ToastService);

  onAreaChange(value: string | number): void {
    this.regrasService.setAreaPorAluno(Number(value));
  }

  onPctChange(value: string | number): void {
    this.regrasService.setPctMaximoUtilizacao(Number(value));
  }

  restaurarPadroes(): void {
    this.regrasService.restaurarPadroes();
    this.toast.info('Regras restauradas', 'Valores padrão aplicados.');
  }
}
