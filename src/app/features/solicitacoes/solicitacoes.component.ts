import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { SolicitacoesService } from '../../core/services/solicitacoes.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { AlertComponent, AlertTone } from '../../shared/ui/alert/alert.component';
import { StatusSolicitacao } from '../../core/models';
import { BadgeComponent, BadgeTone } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { InputComponent } from '../../shared/ui/input/input.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

/** O status de cada pedido só aparece no badge (o de pendente pisca). */
const STATUS: Record<StatusSolicitacao, { rotulo: string; tom: BadgeTone }> = {
  pendente: { rotulo: 'Pendente', tom: 'warning' },
  aprovada: { rotulo: 'Aprovada', tom: 'success' },
  recusada: { rotulo: 'Recusada', tom: 'danger' },
};

@Component({
  selector: 'app-solicitacoes',
  standalone: true,
  imports: [
    FormsModule,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CarregandoComponent,
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
  readonly uiMode = inject(UiModeService);

  readonly enviando = this.solicitacoesService.enviando;
  /** As solicitações só carregam depois das salas (precisam das unidades): o véu cobre as duas cargas. */
  readonly carregando = computed(() => this.solicitacoesService.loading() || this.salasService.trocandoAno());

  /**
   * A unidade (uma filial do RM, "CASJ · filial 2") fica em cima do formulário, na altura da fila, e
   * vale para as duas partes: as salas do formulário de nova solicitação e a fila. 'todas' = todas.
   */
  readonly unidadeId = signal('todas');
  readonly salaId = signal('');
  readonly quantidade = signal(2);
  readonly justificativa = signal('');

  readonly unidadeOptions = computed<SelectOption[]>(() => [
    { value: 'todas', label: 'Todas as unidades' },
    ...this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  ]);

  /** As salas da unidade escolhida (sem unidade, as de todas). */
  readonly salasDaUnidade = computed(() => {
    const unidade = this.unidadeId();
    return unidade === 'todas' ? this.salasService.salas() : this.salasService.salasDaUnidade(unidade);
  });

  /** Com salas de mais de uma unidade na lista, o nome leva a unidade: "Sala 1" existe em várias. */
  readonly salaOptions = computed<SelectOption[]>(() => {
    const salas = this.salasDaUnidade();
    const variasUnidades = new Set(salas.map((s) => s.unidadeId)).size > 1;
    return salas.map((s) => ({
      value: s.id,
      label: variasUnidades ? `${s.nome} · ${this.nomeDaUnidade(s.unidadeId)}` : s.nome,
    }));
  });

  private readonly salaAtual = computed(() => {
    const id = this.salaId() || this.salasDaUnidade()[0]?.id;
    return this.salasService.sala(id ?? '');
  });

  readonly salaSelecionadaId = computed(() => this.salaAtual()?.id ?? '');

  readonly capacidade = computed(() => {
    const sala = this.salaAtual();
    return sala ? this.salasService.capacidade(sala) : 0;
  });

  private readonly ocupacaoAtual = computed(() => {
    const sala = this.salaAtual();
    if (!sala) return 0;
    return Math.max(this.salasService.alunosNoTurno(sala, 'manha'), this.salasService.alunosNoTurno(sala, 'tarde'));
  });

  readonly resultante = computed(() => this.ocupacaoAtual() + (Number(this.quantidade()) || 0));

  readonly excede = computed(() => {
    const sala = this.salaAtual();
    return sala ? this.resultante() > this.capacidade() : false;
  });

  /** As regras de ocupação da filial da sala escolhida (cada unidade tem as suas). */
  private readonly regrasDaSala = computed(() => {
    const sala = this.salaAtual();
    return this.regrasService.regrasDaFilial(sala?.codFilial ?? 0);
  });

  readonly quaseLotada = computed(() => {
    const sala = this.salaAtual();
    if (!sala) return false;
    const limite = (this.regrasDaSala().pctMaximoUtilizacao ?? 90) / 100;
    return this.resultante() / this.capacidade() >= limite && this.resultante() <= this.capacidade();
  });

  readonly bloqueiaSemJustificativa = computed(() => this.excede() && !this.regrasDaSala().permitirExcesso);

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
        text: `${sala.nome} tem ${this.ocupacaoAtual()} aluno(s) hoje, capacidade de ${cap} carteiras.`,
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
        text: `${sala.nome} ficaria em ${this.resultante()} de ${cap} carteiras, acima do limite de ${this.regrasDaSala().pctMaximoUtilizacao}% de utilização (ficaria "Quase lotada").`,
      };
    }
    if (this.regrasDaSala().permitirExcesso) {
      return {
        tone: 'warning',
        text: `${sala.nome} passaria de ${cap} carteiras (capacidade calculada). Informe uma justificativa para prosseguir.`,
      };
    }
    return {
      tone: 'danger',
      text: `Sem espaço físico: ${sala.nome} comporta no máximo ${cap} carteiras (hoje: ${this.ocupacaoAtual()} alunos). O pedido de +${qtd} excede em ${this.resultante() - cap}.`,
    };
  });

  /** As solicitações da unidade escolhida. */
  private readonly solicitacoesDoFiltro = computed(() => {
    const unidade = this.unidadeId();
    const todas = this.solicitacoesService.solicitacoes();
    return unidade === 'todas' ? todas : todas.filter((s) => s.unidadeId === unidade);
  });

  /** A fila, da mais nova para a mais antiga (o código cresce a cada pedido). */
  readonly solicitacoesRows = computed(() =>
    [...this.solicitacoesDoFiltro()]
      .sort((a, b) => b.codSolicitacao - a.codSolicitacao)
      .map((s) => {
        const unidade = this.salasService.unidade(s.unidadeId);
        return {
          solicitacao: s,
          unidadeNome: unidade?.nome ?? `Filial ${s.codFilial}`,
          unidadeCor: unidade?.cor ?? 'transparent',
          statusLabel: STATUS[s.status].rotulo,
          statusTone: STATUS[s.status].tom,
          pendente: s.status === 'pendente',
        };
      }),
  );

  /** Fila vazia: o texto diz de qual unidade. */
  readonly filaVazia = computed(() => {
    const unidade = this.unidadeId();
    return unidade === 'todas' ? 'Nenhuma solicitação' : `Nenhuma solicitação da ${this.nomeDaUnidade(unidade)}`;
  });

  onUnidadeChange(uid: string): void {
    this.unidadeId.set(uid);
    this.salaId.set(this.salasDaUnidade()[0]?.id ?? '');
  }

  /** "CASJ · filial 2"; a unidade sem sala no ano em tela fica pelo número da filial. */
  private nomeDaUnidade(unidadeId: string): string {
    return this.salasService.unidade(unidadeId)?.nome ?? `Filial ${unidadeId}`;
  }

  submit(): void {
    const sala = this.salaAtual();
    if (!sala) return;
    this.solicitacoesService.criar(sala, Number(this.quantidade()) || 0, this.justificativa());
    this.quantidade.set(1);
    this.justificativa.set('');
  }
}
