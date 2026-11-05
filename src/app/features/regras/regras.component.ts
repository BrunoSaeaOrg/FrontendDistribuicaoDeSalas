import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { REGRAS_PADRAO, RegrasOcupacao } from '../../core/models';
import { DestinoDasRegras, listaDeNomes, obsDosPadroes, RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { AlertComponent } from '../../shared/ui/alert/alert.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { InputComponent } from '../../shared/ui/input/input.component';
import { MultiSelectComponent, MultiSelectOption } from '../../shared/ui/multi-select/multi-select.component';
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
    MultiSelectComponent,
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
  private readonly confirmDialog = inject(ConfirmDialogService);

  /** As unidades marcadas: o id de cada uma é o CODFILIAL, onde as regras são gravadas. */
  readonly filiais = signal<string[]>([]);

  /** A Unidade é obrigatória: sem nenhuma marcada, os campos e os botões ficam desativados. */
  readonly temUnidade = computed(() => this.filiais().length > 0);
  /** Campos do formulário desativados: sem unidade marcada ou para quem é só leitura. */
  readonly camposDesativados = computed(() => !this.temUnidade() || this.uiMode.readOnlyMode());

  /** O formulário mostra as regras da primeira unidade marcada (marcar outras não o recarrega). */
  private readonly filialDoFormulario = computed(() => Number(this.filiais()[0] ?? 0));

  constructor() {
    // Trocar a primeira unidade recarrega o formulário com as regras salvas dela no TOTVS.
    effect(() => {
      const filial = this.filialDoFormulario();
      if (!filial) return;
      this.regrasService.carregar(filial);
    });
    // Terminou de gravar: o botão "Restaurar padrões" para de carregar.
    effect(() => {
      if (!this.regrasService.salvando()) this.restaurando.set(false);
    });
  }

  /** "CASJ 1", com "12 salas" embaixo: o mesmo nome de unidade das outras telas. */
  readonly unidadeOptions = computed<MultiSelectOption[]>(() =>
    this.salasService.unidades().map((u) => {
      const salas = this.salasService.salasDaUnidade(u.id).length;
      return { value: u.id, label: u.nome, hint: `${salas} ${salas === 1 ? 'sala' : 'salas'}` };
    }),
  );

  /** As unidades marcadas, na ordem da lista, com o nome que vai no aviso de salvo. */
  private readonly destinos = computed<DestinoDasRegras[]>(() => {
    const marcadas = new Set(this.filiais());
    return this.salasService
      .unidades()
      .filter((u) => marcadas.has(u.id))
      .map((u) => ({ codFilial: u.codFilial, nome: u.nome }));
  });

  readonly ajudaDaUnidade = computed(() => {
    const n = this.destinos().length;
    if (n === 0) return 'Selecione a unidade para ver e alterar as regras dela.';
    return n === 1 ? 'As regras são gravadas na unidade marcada.' : `As regras são gravadas nas ${n} unidades marcadas.`;
  });

  /** Mais de uma unidade marcada, e elas não têm as mesmas regras hoje: salvar iguala todas. */
  readonly regrasDiferentes = computed(() => {
    const regras = this.destinos().map((d) => this.regrasService.regrasDaFilial(d.codFilial));
    const chave = (r: RegrasOcupacao) => `${r.areaPorAluno}|${r.pctMaximoUtilizacao}|${r.permitirExcesso}`;
    return new Set(regras.map(chave)).size > 1;
  });

  readonly podeSalvar = computed(
    () => this.destinos().length > 0 && !this.regrasService.salvando() && !this.regrasService.faltaObs(),
  );

  onAreaChange(value: string | number): void {
    this.regrasService.setAreaPorAluno(Number(value));
  }

  onPctChange(value: string | number): void {
    this.regrasService.setPctMaximoUtilizacao(Number(value));
  }

  salvar(): void {
    this.regrasService.salvar(this.destinos());
  }

  /** Restaurando os padrões (gravando em cada unidade): o botão dele carrega, não o do Salvar. */
  readonly restaurando = signal(false);

  readonly podeRestaurar = computed(() => this.temUnidade() && !this.regrasService.salvando());

  /**
   * Restaura os padrões do sistema e já grava em todas as unidades marcadas, uma por vez, depois de
   * confirmar (a confirmação diz em quais unidades e com que valores).
   */
  async restaurarPadroes(): Promise<void> {
    const destinos = this.destinos();
    if (destinos.length === 0) return;
    const { areaPorAluno, pctMaximoUtilizacao } = REGRAS_PADRAO;
    const unidades = destinos.length === 1 ? `A regra de ${destinos[0].nome}` : `As regras de ${listaDeNomes(destinos.map((d) => d.nome))}`;
    const ok = await this.confirmDialog.confirm({
      title: 'Restaurar os padrões?',
      description:
        `${unidades} ${destinos.length === 1 ? 'passa' : 'passam'} a ser os padrões do sistema: ` +
        `${String(areaPorAluno).replace('.', ',')} m² por pessoa, ${pctMaximoUtilizacao}% de utilização e pode exceder, ` +
        `com a observação "${obsDosPadroes()}". Isso grava no RM agora, uma unidade por vez.`,
      confirmLabel: 'Restaurar e gravar',
      danger: true,
    });
    if (!ok) return;
    this.restaurando.set(true);
    this.regrasService.restaurarPadroes(destinos);
  }
}
