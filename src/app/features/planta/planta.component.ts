import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { Turno } from '../../core/models';
import { AlertComponent } from '../../shared/ui/alert/alert.component';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
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

@Component({
  selector: 'app-planta',
  standalone: true,
  imports: [FormsModule, AlertComponent, BadgeComponent, ButtonComponent, CardComponent, CarregandoComponent, EmptyStateComponent, SelectComponent],
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
  /** Sala sobre a qual o arraste está passando (destaque de zona de drop). */
  readonly dropAlvoId = signal<string | null>(null);

  /** Unidade = filial do RM ("CASJ · filial 2"). */
  readonly unidadeId = signal(
    this.route.snapshot.queryParamMap.get('unidade') || this.salasService.unidades()[0]?.id || '',
  );
  readonly salaId = signal(this.route.snapshot.queryParamMap.get('sala') || '');
  readonly turno = signal<Turno>('manha');
  readonly segmento = signal('todas');
  readonly serie = signal('todas');

  readonly unidadeOptions = computed<SelectOption[]>(() =>
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

  /** As salas da unidade que atendem ao segmento e à série. */
  readonly salasDaUnidade = computed(() => {
    let list = this.salasService.salasDaUnidade(this.unidadeId());
    if (this.segmento() !== 'todas' || this.serie() !== 'todas') {
      list = list.filter((s) => this.matchesFiltro(s.id));
    }
    return list;
  });

  readonly salaOptions = computed<SelectOption[]>(() =>
    this.salasDaUnidade().map((s) => ({ value: s.id, label: s.nome })),
  );

  readonly sala = computed(() => {
    const id = this.salaId() || this.salasDaUnidade()[0]?.id;
    return this.salasService.sala(id ?? '') ?? this.salasDaUnidade()[0];
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
    return this.salasDaUnidade()
      .filter((s) => s.id !== sala.id)
      .map((s) => ({
        id: s.id,
        nome: s.nome,
        tipo: s.tipo,
        ocupadas: this.salasService.alunosNoTurno(s, turno),
        carteiras: s.carteiras,
        limite: this.salasService.limiteDeUso(s),
        /** Quantas carteiras ainda pode receber pela regra (Infinity = o limite não barra). */
        cabem: this.salasService.carteirasQueCabem(s),
        statusInfo: this.salasService.statusInfoCarteiras(s),
      }));
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
        ? { tone: 'warning', text: `${destino.nome} fica com ${depois} carteiras, acima do ${regra}. As regras de ocupação permitem exceder.` }
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

  abrirTransferModal(): void {
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

  /** Dá para seguir: há destino e ele recebe ao menos a quantidade escolhida. */
  readonly podeAvancarTransfer = computed(
    () => !!this.transferDestinoId() && this.transferQuantidade() <= this.transferMaximo(),
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
    if (this.salasService.transferirCarteira(origem, destino, this.transferQuantidade())) this.transferStep.set(3);
  }

  onUnidadeChange(uid: string): void {
    this.unidadeId.set(uid);
    this.salaId.set(this.salasDaUnidade()[0]?.id ?? '');
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
    if (desk.kind !== 'vaga' || !this.uiMode.editorMode()) {
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
    if (!origem || !destino) return;
    this.salasService.transferirCarteira(origem, destino, 1);
  }
}
