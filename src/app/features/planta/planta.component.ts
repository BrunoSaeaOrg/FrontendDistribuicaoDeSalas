import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { Turno } from '../../core/models';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

type DeskKind = 'aluno' | 'vaga' | 'excedente';

interface DeskSlot {
  index: number;
  kind: DeskKind;
  icon: string;
  tooltip: string;
}

const TURNOS: Turno[] = ['manha', 'tarde'];

@Component({
  selector: 'app-planta',
  standalone: true,
  imports: [FormsModule, BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent, SelectComponent],
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
  readonly anoOptions: SelectOption[] = [{ value: '2026', label: '2026' }];

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
    return TURNOS.some((t) => {
      const turma = sala.turnos[t];
      if (!turma) return false;
      if (this.segmento() !== 'todas' && turma.segmento !== this.segmento()) return false;
      if (this.serie() !== 'todas' && this.salasService.serieFromNome(turma.nome) !== this.serie())
        return false;
      return true;
    });
  };

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

  readonly capacidade = computed(() => {
    const sala = this.sala();
    return sala ? this.salasService.capacidade(sala) : 0;
  });

  readonly statusInfo = computed(() => {
    const sala = this.sala();
    return sala ? this.salasService.statusInfo(sala) : { label: '', tone: 'success' as const, key: 'disponivel' as const };
  });

  /**
   * Cor da barra de ocupação, interpolada continuamente (cinza → laranja → vermelho)
   * conforme a ocupação se aproxima e ultrapassa o limite configurado em Regras de
   * ocupação — em vez de 3 degraus fixos, que davam um salto brusco só ao cruzar o
   * limite exato (ex: 88% ainda parecia "tudo bem" mesmo bem perto do alerta).
   */
  readonly progressColor = computed(() => {
    const limite = this.regrasService.regras().pctMaximoUtilizacao ?? 90;
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

  readonly turmaAtual = computed(() => {
    const sala = this.sala();
    return sala ? sala.turnos[this.turno()] : null;
  });

  readonly plantaPct = computed(() => {
    const sala = this.sala();
    const cap = this.capacidade();
    if (!sala || cap === 0) return 0;
    const turma = this.turmaAtual();
    return Math.min(100, Math.round(((turma?.alunos ?? 0) / cap) * 100));
  });

  readonly deskSlots = computed<DeskSlot[]>(() => {
    const sala = this.sala();
    if (!sala) return [];
    const cap = this.capacidade();
    const turma = this.turmaAtual();
    const alunos = turma?.alunos ?? 0;
    const totalSlots = Math.max(cap, alunos);
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
      } else {
        kind = 'excedente';
        icon = 'priority_high';
        tooltip = 'Além da capacidade da sala';
      }
      slots.push({ index: i, kind, icon, tooltip });
    }
    return slots;
  });

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
        statusInfo: this.salasService.statusInfo(s),
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
    this.outrasSalas().map((s) => ({ value: s.id, label: `${s.nome} (${s.carteiras} carteiras)` })),
  );

  readonly transferDestino = computed(() => this.salasService.sala(this.transferDestinoId() ?? ''));

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
    this.transferDestinoId.set(this.outrasSalas()[0]?.id ?? '');
    this.transferQuantidade.set(1);
    this.transferOpen.set(true);
  }

  fecharTransferModal(): void {
    this.transferOpen.set(false);
  }

  onTransferDestinoChange(id: string): void {
    this.transferDestinoId.set(id);
  }

  transferQuantidadeMenos(): void {
    this.transferQuantidade.update((q) => Math.max(1, q - 1));
  }

  transferQuantidadeMais(): void {
    const max = this.vagasNaSalaAtual();
    this.transferQuantidade.update((q) => Math.min(max, q + 1));
  }

  transferAvancar(): void {
    if (!this.transferDestinoId()) return;
    this.transferStep.set(2);
  }

  transferVoltar(): void {
    this.transferStep.set(1);
  }

  transferConfirmar(): void {
    const origem = this.sala();
    const destino = this.transferDestino();
    if (!origem || !destino) return;
    this.salasService.transferirCarteira(origem, destino, this.transferQuantidade());
    this.transferStep.set(3);
  }

  onUnidadeChange(uid: string): void {
    this.unidadeId.set(uid);
    const first = this.salasService.salasDaUnidade(uid)[0];
    this.salaId.set(first ? first.id : '');
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
