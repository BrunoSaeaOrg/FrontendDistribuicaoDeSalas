import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { AlertComponent } from '../../shared/ui/alert/alert.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { InputComponent } from '../../shared/ui/input/input.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';
import { SwitchComponent } from '../../shared/ui/switch/switch.component';

@Component({
  selector: 'app-regras',
  standalone: true,
  imports: [
    FormsModule,
    AlertComponent,
    ButtonComponent,
    CardComponent,
    CarregandoComponent,
    InputComponent,
    SelectComponent,
    SwitchComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './regras.component.html',
  styleUrl: './regras.component.css',
})
export class RegrasComponent {
  readonly regrasService = inject(RegrasService);
  readonly salasService = inject(SalasService);
  readonly uiMode = inject(UiModeService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  /** A unidade escolhida: o id dela é o CODFILIAL, onde as regras são gravadas. */
  readonly codFilial = signal('');

  constructor() {
    // Troca de unidade recarrega as regras salvas dela no TOTVS.
    effect(() => {
      const filial = Number(this.codFilial());
      if (!filial) return;
      this.regrasService.carregar(filial);
    });
  }

  /** "CASJ · filial 2 (12 salas)": o mesmo nome de unidade das outras telas. */
  readonly unidadeOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Selecione a unidade...' },
    ...this.salasService.unidades().map((u) => {
      const salas = this.salasService.salasDaUnidade(u.id).length;
      return { value: u.id, label: `${u.nome} (${salas} ${salas === 1 ? 'sala' : 'salas'})` };
    }),
  ]);

  readonly podeSalvar = computed(
    () => !!this.codFilial() && !this.regrasService.salvando() && !this.regrasService.faltaObs(),
  );

  onAreaChange(value: string | number): void {
    this.regrasService.setAreaPorAluno(Number(value));
  }

  onPctChange(value: string | number): void {
    this.regrasService.setPctMaximoUtilizacao(Number(value));
  }

  salvar(): void {
    const filial = Number(this.codFilial());
    if (!filial) return;
    this.regrasService.salvar(filial);
  }

  async restaurarPadroes(): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Restaurar padrões?',
      description:
        'Os valores atuais (área por pessoa, % máximo de utilização, permitir exceder e observações) serão substituídos pelos padrões do sistema. Isso não é salvo automaticamente — você ainda pode revisar antes de clicar em "Salvar regras".',
      confirmLabel: 'Restaurar',
      danger: true,
    });
    if (!ok) return;
    this.regrasService.restaurarPadroes();
    this.toast.info('Regras restauradas', 'Valores padrão aplicados.');
  }
}
