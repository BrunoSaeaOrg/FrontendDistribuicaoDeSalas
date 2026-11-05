import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { SolicitacoesService } from '../../core/services/solicitacoes.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { AlertComponent, AlertTone } from '../../shared/ui/alert/alert.component';
import { StatusSolicitacao, unidadeNoFiltro } from '../../core/models';
import { BadgeComponent, BadgeTone } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { InputComponent } from '../../shared/ui/input/input.component';
import { MultiSelectComponent, MultiSelectOption } from '../../shared/ui/multi-select/multi-select.component';
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
    MultiSelectComponent,
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
   * As unidades marcadas (cada uma é uma filial do RM, ex.: "CASJ 1") ficam em cima do formulário,
   * na altura da fila, e valem para as duas partes: as salas do formulário de nova solicitação e a
   * fila. Nenhuma marcada = todas.
   */
  readonly unidades = signal<string[]>([]);
  readonly salaId = signal('');
  readonly quantidade = signal(2);
  readonly justificativa = signal('');

  readonly unidadeOptions = computed<MultiSelectOption[]>(() =>
    this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  );

  /** As salas das unidades marcadas (sem nenhuma, as de todas). */
  readonly salasDaUnidade = computed(() => {
    const unidades = this.unidades();
    return this.salasService.salas().filter((s) => unidadeNoFiltro(unidades, s.unidadeId));
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

  /** As solicitações das unidades marcadas. */
  private readonly solicitacoesDoFiltro = computed(() => {
    const unidades = this.unidades();
    return this.solicitacoesService.solicitacoes().filter((s) => unidadeNoFiltro(unidades, s.unidadeId));
  });

  /** A fila, da mais nova para a mais antiga (o código cresce a cada pedido). */
  readonly solicitacoesRows = computed(() =>
    [...this.solicitacoesDoFiltro()]
      .sort((a, b) => b.codSolicitacao - a.codSolicitacao)
      .map((s) => {
        const unidade = this.salasService.unidade(s.unidadeId);
        return {
          solicitacao: s,
          unidadeNome: unidade?.nome ?? this.salasService.nomeDaFilial(s.codFilial),
          unidadeCor: unidade?.cor ?? 'transparent',
          statusLabel: STATUS[s.status].rotulo,
          statusTone: STATUS[s.status].tom,
          pendente: s.status === 'pendente',
        };
      }),
  );

  /** Fila vazia: com uma unidade marcada, o texto diz qual. */
  readonly filaVazia = computed(() => {
    const unidades = this.unidades();
    if (unidades.length === 1) return `Nenhuma solicitação da ${this.nomeDaUnidade(unidades[0])}`;
    return unidades.length > 1 && unidades.length < this.salasService.unidades().length
      ? 'Nenhuma solicitação nas unidades marcadas'
      : 'Nenhuma solicitação';
  });

  /** A sala do formulário fica se ainda for de uma das unidades marcadas; se não, vai para a primeira. */
  selecionarUnidades(unidades: string[]): void {
    this.unidades.set(unidades);
    const salas = this.salasDaUnidade();
    if (!salas.some((s) => s.id === this.salaSelecionadaId())) this.salaId.set(salas[0]?.id ?? '');
  }

  /** "CASJ 1"; a unidade sem sala no ano em tela vem das filiais já vistas. */
  private nomeDaUnidade(unidadeId: string): string {
    return this.salasService.unidade(unidadeId)?.nome ?? this.salasService.nomeDaFilial(unidadeId);
  }

  submit(): void {
    const sala = this.salaAtual();
    if (!sala) return;
    this.solicitacoesService.criar(sala, Number(this.quantidade()) || 0, this.justificativa());
    this.quantidade.set(1);
    this.justificativa.set('');
  }
}
