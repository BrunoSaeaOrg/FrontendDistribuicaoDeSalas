import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { SolicitacoesService } from '../../core/services/solicitacoes.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { Solicitacao } from '../../core/models';
import { AlertComponent, AlertTone } from '../../shared/ui/alert/alert.component';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { InputComponent } from '../../shared/ui/input/input.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

@Component({
  selector: 'app-solicitacoes',
  standalone: true,
  imports: [
    FormsModule,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    InputComponent,
    SelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './solicitacoes.component.html',
  styleUrl: './solicitacoes.component.css',
})
export class SolicitacoesComponent {
  private readonly salasService = inject(SalasService);
  private readonly regrasService = inject(RegrasService);
  private readonly solicitacoesService = inject(SolicitacoesService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly uiMode = inject(UiModeService);

  readonly unidadeId = signal(this.salasService.unidades()[0]?.id ?? '');
  readonly salaId = signal('');
  readonly quantidade = signal(2);
  readonly justificativa = signal('');

  readonly unidadeOptions = computed<SelectOption[]>(() =>
    this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  );

  readonly salasDaUnidade = computed(() => this.salasService.salasDaUnidade(this.unidadeId()));

  readonly salaOptions = computed<SelectOption[]>(() =>
    this.salasDaUnidade().map((s) => ({ value: s.id, label: s.nome })),
  );

  private readonly salaAtual = computed(() => {
    const id = this.salaId() || this.salasDaUnidade()[0]?.id;
    return this.salasService.sala(id ?? '');
  });

  readonly salaSelecionadaId = computed(() => this.salaAtual()?.id ?? '');

  readonly capacidade = computed(() => {
    const sala = this.salaAtual();
    return sala ? this.salasService.capacidade(sala) : 0;
  });

  readonly resultante = computed(() => {
    const sala = this.salaAtual();
    return sala ? sala.carteiras + (Number(this.quantidade()) || 0) : 0;
  });

  readonly excede = computed(() => {
    const sala = this.salaAtual();
    return sala ? this.resultante() > this.capacidade() : false;
  });

  readonly quaseLotada = computed(() => {
    const sala = this.salaAtual();
    if (!sala) return false;
    const limite = (this.regrasService.regras().pctMaximoUtilizacao ?? 90) / 100;
    return this.resultante() / this.capacidade() >= limite && this.resultante() <= this.capacidade();
  });

  readonly bloqueiaSemJustificativa = computed(
    () => this.excede() && !this.regrasService.regras().permitirExcesso,
  );

  readonly podeEnviar = computed(() => {
    const sala = this.salaAtual();
    const qtd = Number(this.quantidade()) || 0;
    return (
      !!sala &&
      qtd > 0 &&
      !this.bloqueiaSemJustificativa() &&
      (!this.excede() || this.justificativa().trim().length > 0)
    );
  });

  readonly alert = computed<{ tone: AlertTone; text: string }>(() => {
    const sala = this.salaAtual();
    const qtd = Number(this.quantidade()) || 0;
    const cap = this.capacidade();

    if (!sala) return { tone: 'info', text: 'Selecione uma sala.' };
    if (qtd <= 0) {
      return {
        tone: 'info',
        text: `${sala.nome} tem ${sala.carteiras} carteira(s) hoje, capacidade calculada de ${cap}.`,
      };
    }
    if (!this.excede() && !this.quaseLotada()) {
      return {
        tone: 'success',
        text: `Espaço físico disponível: após a inclusão, ${this.resultante()} de ${cap} carteiras (sobram ${cap - this.resultante()}).`,
      };
    }
    if (!this.excede() && this.quaseLotada()) {
      return {
        tone: 'warning',
        text: `${sala.nome} ficaria em ${this.resultante()} de ${cap} carteiras, acima do limite de ${this.regrasService.regras().pctMaximoUtilizacao}% de utilização (ficaria "Quase lotada").`,
      };
    }
    if (this.regrasService.regras().permitirExcesso) {
      return {
        tone: 'warning',
        text: `${sala.nome} passaria de ${cap} carteiras (capacidade calculada). Informe uma justificativa para prosseguir.`,
      };
    }
    return {
      tone: 'danger',
      text: `Sem espaço físico: ${sala.nome} comporta no máximo ${cap} carteiras (hoje: ${sala.carteiras}). O pedido de +${qtd} excede em ${this.resultante() - cap}.`,
    };
  });

  readonly solicitacoesRows = computed(() =>
    this.solicitacoesService.solicitacoes().map((s) => ({
      solicitacao: s,
      statusLabel: { pendente: 'Pendente', aprovada: 'Aprovada', recusada: 'Recusada' }[s.status],
      statusTone: ({ pendente: 'warning', aprovada: 'success', recusada: 'danger' } as const)[s.status],
      showActions: this.uiMode.editorMode() && s.status === 'pendente',
    })),
  );

  onUnidadeChange(uid: string): void {
    this.unidadeId.set(uid);
    const first = this.salasService.salasDaUnidade(uid)[0];
    this.salaId.set(first ? first.id : '');
  }

  submit(): void {
    const sala = this.salaAtual();
    if (!sala) return;
    this.solicitacoesService.criar(sala, Number(this.quantidade()) || 0, this.justificativa());
    this.quantidade.set(1);
    this.justificativa.set('');
  }

  async aprovar(sol: Solicitacao): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Aprovar solicitação?',
      description: `${sol.quantidade} carteira(s) serão adicionadas em ${sol.salaNome}.`,
      confirmLabel: 'Aprovar',
    });
    if (ok) this.solicitacoesService.aprovar(sol);
  }

  async recusar(sol: Solicitacao): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Recusar solicitação?',
      description: `O pedido de ${sol.salaNome} será marcado como recusado.`,
      confirmLabel: 'Recusar',
      danger: true,
    });
    if (ok) this.solicitacoesService.recusar(sol);
  }
}
