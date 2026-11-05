import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { Turno, unidadeNoFiltro } from '../../core/models';
import { AlertComponent } from '../../shared/ui/alert/alert.component';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { MultiSelectComponent, MultiSelectOption } from '../../shared/ui/multi-select/multi-select.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

type DeskKind = 'aluno' | 'vaga' | 'excedente' | 'espaco' | 'bloqueado';

interface DeskSlot {
  index: number;
  kind: DeskKind;
  icon: string;
  tooltip: string;
  /** Posição além do limite da regra de ocupação (só existe quando a filial deixa exceder ou a sala já passou). */
  acimaDoLimite: boolean;
}

const TURNOS: Turno[] = ['manha', 'tarde'];

/** Tamanho do campo da justificativa no histórico das transferências (varchar 500). */
export const TAMANHO_JUSTIFICATIVA = 500;

@Component({
  selector: 'app-planta',
  standalone: true,
  imports: [
    FormsModule,
    NgTemplateOutlet,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CarregandoComponent,
    EmptyStateComponent,
    MultiSelectComponent,
    SelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planta.component.html',
  styleUrl: './planta.component.css',
})
export class PlantaComponent {
  private readonly salasService = inject(SalasService);
  private readonly regrasService = inject(RegrasService);
  private readonly route = inject(ActivatedRoute);
  readonly uiMode = inject(UiModeService);

  /** Carteira vaga sendo arrastada no momento (null quando não há arraste em curso). */
  readonly arrastando = signal(false);

  /**
   * Transferência em andamento (gravando no RM e relendo as salas): véu sobre a sala, spinner na
   * sala que recebe e nenhum arraste novo até terminar.
   */
  readonly transferindo = this.salasService.transferindo;
  readonly textoTransferindo = computed(() => {
    const t = this.transferindo();
    if (!t) return '';
    if (t.etapa === 'relendo') return 'Atualizando as salas...';
    return `Transferindo ${t.quantidade} ${t.quantidade === 1 ? 'carteira' : 'carteiras'} para ${t.destinoNome}...`;
  });
  /** Na linha da sala que recebe, em "Outras salas". */
  readonly textoRecebendo = computed(() => {
    const t = this.transferindo();
    if (!t) return '';
    if (t.etapa === 'relendo') return 'Atualizando...';
    return `Recebendo ${t.quantidade} ${t.quantidade === 1 ? 'carteira' : 'carteiras'}...`;
  });
  /** Sala sobre a qual o arraste está passando (destaque de zona de drop). */
  readonly dropAlvoId = signal<string | null>(null);

  /**
   * Unidades marcadas (cada uma é uma filial do RM, ex.: "CASJ 1"); nenhuma = todas. Vindo do
   * Painel ("Ver planta"), abre com a unidade da sala.
   */
  readonly unidades = signal<string[]>(
    this.route.snapshot.queryParamMap.get('unidade') ? [this.route.snapshot.queryParamMap.get('unidade')!] : [],
  );
  readonly salaId = signal(this.route.snapshot.queryParamMap.get('sala') || '');
  readonly turno = signal<Turno>('manha');
  readonly segmento = signal('todas');
  readonly serie = signal('todas');

  readonly unidadeOptions = computed<MultiSelectOption[]>(() =>
    this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  );
  /** Ano letivo das turmas: os anos vêm do RM, e trocar recarrega as turmas daquele ano. */
  readonly anoLetivo = this.salasService.anoLetivo;
  /** O ano escolhido ainda está vindo do RM: spinner no campo do ano e véu sobre o conteúdo. */
  readonly carregando = this.salasService.loading;
  readonly trocandoAno = this.salasService.trocandoAno;
  readonly anoLetivoOptions = computed<SelectOption[]>(() =>
    this.salasService.anosLetivos().map((ano) => ({ value: ano, label: ano })),
  );

  selecionarAno(ano: string): void {
    this.salasService.selecionarAno(ano);
  }

  readonly segmentoOptions = computed<SelectOption[]>(() => [
    { value: 'todas', label: 'Todos os segmentos' },
    ...this.salasService.segmentos().map((s) => ({ value: s, label: s })),
  ]);

  readonly serieOptions = computed<SelectOption[]>(() => [
    { value: 'todas', label: 'Todas as séries' },
    ...this.salasService.series().map((s) => ({ value: s, label: s })),
  ]);

  private matchesFiltro = (salaId: string): boolean => {
    const sala = this.salasService.sala(salaId);
    if (!sala) return false;
    return TURNOS.some((t) =>
      this.salasService.turmasNoTurno(sala, t).some((turma) => {
        if (this.segmento() !== 'todas' && turma.segmento !== this.segmento()) return false;
        if (this.serie() !== 'todas' && this.salasService.serieFromNome(turma.nome) !== this.serie())
          return false;
        return true;
      }),
    );
  };

  /** As salas das unidades marcadas que atendem ao segmento e à série. */
  readonly salasDoFiltro = computed(() => {
    const unidades = this.unidades();
    let list = this.salasService.salas().filter((s) => unidadeNoFiltro(unidades, s.unidadeId));
    if (this.segmento() !== 'todas' || this.serie() !== 'todas') {
      list = list.filter((s) => this.matchesFiltro(s.id));
    }
    return list;
  });

  /** Com salas de mais de uma unidade na lista, o nome leva a unidade: "Sala 1" existe em várias. */
  readonly salaOptions = computed<SelectOption[]>(() => {
    const salas = this.salasDoFiltro();
    const variasUnidades = new Set(salas.map((s) => s.unidadeId)).size > 1;
    return salas.map((s) => ({
      value: s.id,
      label: variasUnidades ? `${s.nome} · ${this.salasService.unidade(s.unidadeId)?.nome ?? ''}` : s.nome,
    }));
  });

  readonly sala = computed(() => {
    const id = this.salaId() || this.salasDoFiltro()[0]?.id;
    return this.salasService.sala(id ?? '') ?? this.salasDoFiltro()[0];
  });

  /** Carteiras fisicas da sala (nao a capacidade normativa) — base do drag-and-drop. */
  readonly capacidade = computed(() => {
    const sala = this.sala();
    return sala ? sala.carteiras : 0;
  });

  /** Capacidade normativa da sala (area/1,5m² etc.) — teto do "espaço disponível" na grade. */
  readonly capacidadeNormativa = computed(() => {
    const sala = this.sala();
    return sala ? this.salasService.capacidade(sala) : 0;
  });

  readonly statusInfo = computed(() => {
    const sala = this.sala();
    return sala ? this.salasService.statusInfoCarteiras(sala) : { label: '', tone: 'success' as const, key: 'disponivel' as const };
  });

  /** As regras de ocupação da filial da sala (cada unidade tem as suas). */
  private readonly regraDaSala = computed(() => {
    const sala = this.sala();
    return sala ? this.regrasService.regrasDaFilial(sala.codFilial) : null;
  });

  /**
   * Quantas carteiras a sala pode ter pela regra: capacidade × % máximo de utilização (30 com 50%
   * → 15). null = sala sem capacidade no RM, sem limite.
   */
  readonly limite = computed(() => {
    const sala = this.sala();
    return sala ? this.salasService.limiteDeUso(sala) : null;
  });

  /** A filial deixa passar do limite ("Permitir exceder" nas Regras). */
  readonly podeExceder = computed(() => this.regraDaSala()?.permitirExcesso ?? false);

  /** "Limite de 15 carteiras (50% de 30)", no cabeçalho da sala. */
  readonly limiteLabel = computed(() => {
    const limite = this.limite();
    if (limite === null) return 'Sem capacidade cadastrada: sem limite';
    const pct = this.regraDaSala()?.pctMaximoUtilizacao ?? 90;
    const base = `Limite de ${limite} ${limite === 1 ? 'carteira' : 'carteiras'} (${pct}% de ${this.capacidadeNormativa()})`;
    return this.podeExceder() ? `${base}, pode exceder` : base;
  });

  /** A sala já tem mais carteiras do que o limite (de antes da regra, ou com "Permitir exceder"). */
  readonly acimaDoLimite = computed(() => {
    const limite = this.limite();
    return limite !== null && this.capacidade() > limite;
  });

  /**
   * Cor da barra de ocupação, interpolada continuamente (cinza → laranja → vermelho)
   * conforme a ocupação se aproxima e ultrapassa o limite configurado em Regras de
   * ocupação — em vez de 3 degraus fixos, que davam um salto brusco só ao cruzar o
   * limite exato (ex: 88% ainda parecia "tudo bem" mesmo bem perto do alerta).
   */
  readonly progressColor = computed(() => {
    const limite = this.regraDaSala()?.pctMaximoUtilizacao ?? 90;
    const pct = this.plantaPct();
    const disponivel = { r: 148, g: 163, b: 184 }; // --saea-ink-faint
    const alerta = { r: 238, g: 98, b: 17 }; // --saea-warning
    const perigo = { r: 211, g: 25, b: 25 }; // --saea-danger

    const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
    const mix = (from: { r: number; g: number; b: number }, to: { r: number; g: number; b: number }, t: number) =>
      `rgb(${lerp(from.r, to.r, t)}, ${lerp(from.g, to.g, t)}, ${lerp(from.b, to.b, t)})`;

    if (pct <= 0) return mix(disponivel, disponivel, 0);
    if (pct >= 100) return mix(perigo, perigo, 0);
    if (pct <= limite) return mix(disponivel, alerta, pct / limite);
    return mix(alerta, perigo, (pct - limite) / (100 - limite));
  });

  readonly turnoTabs: { turno: Turno; label: string }[] = [
    { turno: 'manha', label: 'Manhã' },
    { turno: 'tarde', label: 'Tarde' },
  ];

  /** Alunos da sala no turno (soma das turmas, quando há mais de uma). */
  readonly alunosAtuais = computed(() => {
    const sala = this.sala();
    return sala ? this.salasService.alunosNoTurno(sala, this.turno()) : 0;
  });

  /** Turmas do turno numa linha: "1º ano A · 28 alunos; 1º ano B · 25 alunos". */
  readonly turmasLabel = computed(() => {
    const sala = this.sala();
    if (!sala) return '';
    return this.salasService
      .turmasNoTurno(sala, this.turno())
      .map((t) => `${t.nomeProprio} · ${t.alunos} alunos`)
      .join('; ');
  });

  readonly plantaPct = computed(() => {
    const sala = this.sala();
    const cap = this.capacidade();
    if (!sala || cap === 0) return 0;
    return Math.min(100, Math.round((this.alunosAtuais() / cap) * 100));
  });

  /**
   * A grade da sala: as carteiras (com e sem aluno), os alunos sem carteira e o espaço que sobra até
   * a capacidade. O espaço vai até o limite da regra de ocupação; dali até a capacidade fica
   * bloqueado, ou, se a filial deixa exceder, livre mas marcado como acima do limite.
   */
  readonly deskSlots = computed<DeskSlot[]>(() => {
    const sala = this.sala();
    if (!sala) return [];
    const cap = this.capacidade();
    const capNorm = Math.max(cap, this.capacidadeNormativa());
    const limite = this.limite() ?? capNorm;
    const podeExceder = this.podeExceder();
    const pct = this.regraDaSala()?.pctMaximoUtilizacao ?? 90;
    const alunos = this.alunosAtuais();
    const totalSlots = Math.max(cap, capNorm, alunos);
    const slots: DeskSlot[] = [];
    for (let i = 0; i < totalSlots; i++) {
      let kind: DeskKind;
      let icon: string;
      let tooltip: string;
      if (i < Math.min(alunos, cap)) {
        kind = 'aluno';
        icon = 'person';
        tooltip = 'Carteira ocupada por aluno';
      } else if (i < cap) {
        kind = 'vaga';
        icon = 'event_seat';
        tooltip = 'Carteira vaga neste turno';
      } else if (i < alunos) {
        kind = 'excedente';
        icon = 'priority_high';
        tooltip = 'Além das carteiras físicas da sala';
      } else if (i < limite) {
        kind = 'espaco';
        icon = 'add';
        tooltip = `Cabe carteira aqui, dentro do limite de ${pct}%`;
      } else if (i < capNorm && podeExceder) {
        kind = 'espaco';
        icon = 'add';
        tooltip = `Acima do limite de ${pct}%: permitido pelas regras de ocupação`;
      } else if (i < capNorm) {
        kind = 'bloqueado';
        icon = 'block';
        tooltip = `Bloqueado pela regra de ocupação: a sala pode usar ${pct}% da capacidade`;
      } else {
        kind = 'excedente';
        icon = 'priority_high';
        tooltip = 'Além da capacidade da sala';
      }
      const acimaDoLimite = i >= limite && kind !== 'bloqueado' && kind !== 'excedente';
      if (acimaDoLimite && kind !== 'espaco') tooltip += ` (acima do limite de ${pct}%)`;
      slots.push({ index: i, kind, icon, tooltip, acimaDoLimite });
    }
    return slots;
  });

  /** A legenda só mostra "Bloqueado" e "Acima do limite" quando a grade tem esses quadros. */
  readonly temBloqueado = computed(() => this.deskSlots().some((d) => d.kind === 'bloqueado'));
  readonly temAcimaDoLimite = computed(() => this.deskSlots().some((d) => d.acimaDoLimite));

  readonly outrasSalas = computed(() => {
    const sala = this.sala();
    if (!sala) return [];
    const turno = this.turno();
    // Só as da mesma unidade da sala: carteira não passa de uma unidade (filial) para outra.
    return this.salasDoFiltro()
      .filter((s) => s.id !== sala.id && s.unidadeId === sala.unidadeId)
      .map((s) => {
        const cabem = this.salasService.carteirasQueCabem(s);
        const pedeJustificativa = this.salasService.precisaJustificativa(s, 1);
        return {
          id: s.id,
          nome: s.nome,
          tipo: s.tipo,
          ocupadas: this.salasService.alunosNoTurno(s, turno),
          carteiras: s.carteiras,
          limite: this.salasService.limiteDeUso(s),
          /** Quantas carteiras ainda pode receber pela regra (Infinity = o limite não barra). */
          cabem,
          /**
           * O que a sala mostra enquanto uma carteira é arrastada: por que não recebe (sem "Permitir
           * exceder") ou que soltar ali vai pedir justificativa.
           */
          avisoNoArraste:
            cabem < 1
              ? { tone: 'danger' as const, text: `No ${this.salasService.descricaoDoLimite(s)}: não recebe mais carteiras` }
              : pedeJustificativa
                ? { tone: 'warning' as const, text: `Passa do ${this.salasService.descricaoDoLimite(s)}: pede justificativa` }
                : null,
          statusInfo: this.salasService.statusInfoCarteiras(s),
        };
      });
  });

  /** Carteiras vagas na sala atual, no turno selecionado — teto de quantidade transferível. */
  readonly vagasNaSalaAtual = computed(() => {
    const sala = this.sala();
    if (!sala) return 0;
    return Math.max(0, this.capacidade() - this.salasService.alunosNoTurno(sala, this.turno()));
  });

  readonly podeTransferir = computed(() => this.uiMode.editorMode() && this.vagasNaSalaAtual() > 0);

  // ---------- modal "Transferir carteiras" (wizard mobile em 2 passos) ----------
  readonly transferOpen = signal(false);
  readonly transferStep = signal<1 | 2 | 3>(1);
  readonly transferDestinoId = signal('');
  readonly transferQuantidade = signal(1);

  readonly transferDestinoOptions = computed<SelectOption[]>(() =>
    this.outrasSalas().map((s) => {
      const cabe = s.cabem === Infinity ? '' : s.cabem > 0 ? ` · cabem mais ${s.cabem}` : ' · no limite';
      return { value: s.id, label: `${s.nome} (${s.carteiras} carteiras${cabe})` };
    }),
  );

  readonly transferDestino = computed(() => this.salasService.sala(this.transferDestinoId() ?? ''));

  /** Quantas carteiras o destino ainda pode receber pela regra (Infinity = o limite não barra). */
  readonly cabemNoDestino = computed(() => {
    const destino = this.transferDestino();
    return destino ? this.salasService.carteirasQueCabem(destino) : 0;
  });

  /** Teto do "+": as vagas da sala de origem e o que o destino ainda pode receber. */
  readonly transferMaximo = computed(() => Math.min(this.vagasNaSalaAtual(), this.cabemNoDestino()));

  /** O aviso da regra embaixo da quantidade: o que o destino recebe, ou que vai passar do limite. */
  readonly transferAvisoLimite = computed<{ tone: 'info' | 'warning' | 'danger'; text: string } | null>(() => {
    const destino = this.transferDestino();
    if (!destino) return null;
    const limite = this.salasService.limiteDeUso(destino);
    if (limite === null) return null;
    const pct = this.regrasService.regrasDaFilial(destino.codFilial).pctMaximoUtilizacao;
    const regra = `limite de ${limite} = ${pct}% de ${this.salasService.capacidade(destino)}`;
    const depois = destino.carteiras + this.transferQuantidade();
    if (this.salasService.podeExcederLimite(destino)) {
      return depois > limite
        ? {
            tone: 'warning',
            text: `${destino.nome} fica com ${depois} carteiras, acima do ${regra}. As regras de ocupação permitem exceder, com justificativa.`,
          }
        : null;
    }
    const cabem = this.cabemNoDestino();
    if (cabem <= 0) return { tone: 'danger', text: `${destino.nome} já está no ${regra} e não recebe mais carteiras.` };
    return { tone: 'info', text: `${destino.nome} recebe até ${cabem} ${cabem === 1 ? 'carteira' : 'carteiras'} (${regra}).` };
  });

  readonly transferPreview = computed(() => {
    const origem = this.sala();
    const destino = this.transferDestino();
    const qtd = this.transferQuantidade();
    if (!origem || !destino) return null;
    return {
      origemNome: origem.nome,
      destinoNome: destino.nome,
      origemAntes: origem.carteiras,
      origemDepois: origem.carteiras - qtd,
      destinoAntes: destino.carteiras,
      destinoDepois: destino.carteiras + qtd,
    };
  });

  // ---------- justificativa: o destino passa do limite e a filial permite exceder ----------
  readonly tamanhoJustificativa = TAMANHO_JUSTIFICATIVA;
  /** O texto da justificativa (do modal "Transferir carteiras" ou do que abre ao soltar uma carteira). */
  readonly justificativa = signal('');
  readonly justificativaOk = computed(() => this.justificativa().trim().length > 0);

  /** No modal "Transferir carteiras": o destino escolhido passa do limite com a quantidade escolhida. */
  readonly transferPrecisaJustificativa = computed(() => {
    const destino = this.transferDestino();
    return !!destino && this.salasService.precisaJustificativa(destino, this.transferQuantidade());
  });

  /** Carteira solta numa sala que passa do limite (e pode exceder): a transferência espera a justificativa. */
  readonly pedidoJustificativa = signal<{ origemId: string; destinoId: string } | null>(null);

  readonly pedidoJustificativaInfo = computed(() => {
    const pedido = this.pedidoJustificativa();
    const origem = pedido ? this.salasService.sala(pedido.origemId) : undefined;
    const destino = pedido ? this.salasService.sala(pedido.destinoId) : undefined;
    if (!origem || !destino) return null;
    return {
      origemNome: origem.nome,
      destinoNome: destino.nome,
      depois: destino.carteiras + 1,
      regra: this.salasService.descricaoDoLimite(destino),
    };
  });

  private readonly campoJustificativa = viewChild<ElementRef<HTMLTextAreaElement>>('campoJustificativa');

  constructor() {
    // Ao soltar a carteira, o modal da justificativa abre com o cursor no campo.
    effect(() => {
      const campo = this.campoJustificativa();
      if (campo && this.pedidoJustificativa()) campo.nativeElement.focus();
    });
  }

  /** Fecha sem transferir; com a transferência já em andamento, espera ela terminar. */
  cancelarJustificativa(): void {
    if (this.transferindo()) return;
    this.pedidoJustificativa.set(null);
  }

  /** Grava com a justificativa; o modal fica aberto, com o botão carregando, até a tela ter os números novos. */
  confirmarJustificativa(): void {
    const pedido = this.pedidoJustificativa();
    const origem = pedido ? this.salasService.sala(pedido.origemId) : undefined;
    const destino = pedido ? this.salasService.sala(pedido.destinoId) : undefined;
    if (!origem || !destino || !this.justificativaOk()) return;
    // Deu certo ou não, fecha no fim: o aviso diz o que houve, e repetir poderia mover duas vezes.
    this.salasService.transferirCarteira(origem, destino, 1, this.justificativa(), () => this.pedidoJustificativa.set(null));
  }

  abrirTransferModal(): void {
    this.justificativa.set('');
    this.transferStep.set(1);
    // Começa pela primeira sala que ainda pode receber carteira.
    const outras = this.outrasSalas();
    this.transferDestinoId.set((outras.find((s) => s.cabem > 0) ?? outras[0])?.id ?? '');
    this.transferQuantidade.set(1);
    this.transferOpen.set(true);
  }

  fecharTransferModal(): void {
    this.transferOpen.set(false);
  }

  onTransferDestinoChange(id: string): void {
    this.transferDestinoId.set(id);
    // O novo destino pode receber menos do que o que estava escolhido.
    this.transferQuantidade.update((q) => Math.max(1, Math.min(q, this.transferMaximo())));
  }

  transferQuantidadeMenos(): void {
    this.transferQuantidade.update((q) => Math.max(1, q - 1));
  }

  transferQuantidadeMais(): void {
    const max = this.transferMaximo();
    this.transferQuantidade.update((q) => Math.min(max, q + 1));
  }

  /**
   * Dá para seguir: há destino, ele recebe ao menos a quantidade escolhida e, se passar do limite
   * (com "Permitir exceder"), a justificativa está escrita.
   */
  readonly podeAvancarTransfer = computed(
    () =>
      !!this.transferDestinoId() &&
      this.transferQuantidade() <= this.transferMaximo() &&
      (!this.transferPrecisaJustificativa() || this.justificativaOk()),
  );

  transferAvancar(): void {
    if (!this.podeAvancarTransfer()) return;
    this.transferStep.set(2);
  }

  transferVoltar(): void {
    this.transferStep.set(1);
  }

  transferConfirmar(): void {
    const origem = this.sala();
    const destino = this.transferDestino();
    if (!origem || !destino) return;
    const justificativa = this.transferPrecisaJustificativa() ? this.justificativa() : '';
    // O botão fica em "Transferindo..." até gravar e reler as salas; só então mostra o "Concluído".
    this.salasService.transferirCarteira(origem, destino, this.transferQuantidade(), justificativa, (ok) => {
      if (ok) this.transferStep.set(3);
    });
  }

  /** A sala na tela fica se ainda estiver nas unidades marcadas; se não, vai para a primeira delas. */
  selecionarUnidades(unidades: string[]): void {
    this.unidades.set(unidades);
    const salas = this.salasDoFiltro();
    const atual = this.sala();
    if (!atual || !salas.some((s) => s.id === atual.id)) this.salaId.set(salas[0]?.id ?? '');
  }

  onSalaChange(id: string): void {
    this.salaId.set(id);
  }

  onSegmentoChange(v: string): void {
    this.segmento.set(v);
  }
  onSerieChange(v: string): void {
    this.serie.set(v);
  }

  onDeskDragStart(desk: DeskSlot, event: DragEvent): void {
    if (desk.kind !== 'vaga' || !this.uiMode.editorMode() || this.transferindo()) {
      event.preventDefault();
      return;
    }
    this.arrastando.set(true);
    event.dataTransfer?.setData('text/plain', String(desk.index));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDeskDragEnd(): void {
    this.arrastando.set(false);
    this.dropAlvoId.set(null);
  }

  onOutraSalaDragOver(salaId: string, event: DragEvent): void {
    if (!this.arrastando()) return;
    // Sala no limite da regra: sem preventDefault o navegador não deixa soltar ali.
    const sala = this.salasService.sala(salaId);
    if (!sala || this.salasService.carteirasQueCabem(sala) < 1) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dropAlvoId.set(salaId);
  }

  onOutraSalaDragLeave(salaId: string): void {
    if (this.dropAlvoId() === salaId) this.dropAlvoId.set(null);
  }

  onOutraSalaDrop(destinoId: string, event: DragEvent): void {
    event.preventDefault();
    const origem = this.sala();
    const destino = this.salasService.sala(destinoId);
    this.arrastando.set(false);
    this.dropAlvoId.set(null);
    if (!origem || !destino || this.transferindo()) return;
    // Passa do limite e a filial permite exceder: só transfere depois da justificativa.
    if (this.salasService.precisaJustificativa(destino, 1)) {
      this.justificativa.set('');
      this.pedidoJustificativa.set({ origemId: origem.id, destinoId: destino.id });
      return;
    }
    this.salasService.transferirCarteira(origem, destino, 1);
  }
}
