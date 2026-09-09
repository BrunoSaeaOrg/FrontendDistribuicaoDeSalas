import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { SalasService } from '../../core/services/salas.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { Turno } from '../../core/models';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

type DeskKind = 'aluno' | 'vaga' | 'livre' | 'excedente';

interface DeskSlot {
  index: number;
  kind: DeskKind;
  icon: string;
  tooltip: string;
  draggable: boolean;
}

const TURNOS: Turno[] = ['manha', 'tarde'];

@Component({
  selector: 'app-planta',
  standalone: true,
  imports: [FormsModule, BadgeComponent, CardComponent, EmptyStateComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planta.component.html',
  styleUrl: './planta.component.css',
})
export class PlantaComponent {
  private readonly salasService = inject(SalasService);
  private readonly route = inject(ActivatedRoute);
  readonly uiMode = inject(UiModeService);

  readonly unidadeId = signal(
    this.route.snapshot.queryParamMap.get('unidade') || this.salasService.unidades()[0]?.id || '',
  );
  readonly salaId = signal(this.route.snapshot.queryParamMap.get('sala') || '');
  readonly turno = signal<Turno>('manha');
  readonly segmento = signal('todas');
  readonly serie = signal('todas');
  readonly selectedDesk = signal<number | null>(null);
  readonly dragOverSalaId = signal<string | null>(null);
  readonly isDraggingDesk = signal(false);

  readonly unidadeOptions = computed<SelectOption[]>(() =>
    this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  );
  readonly anoOptions: SelectOption[] = [{ value: '2026', label: '2026' }];

  readonly segmentoOptions: SelectOption[] = [
    { value: 'todas', label: 'Todos os segmentos' },
    { value: 'Educação Infantil', label: 'Educação Infantil' },
    { value: 'Fundamental I', label: 'Fundamental I' },
    { value: 'Fundamental II', label: 'Fundamental II' },
    { value: 'Ensino Médio', label: 'Ensino Médio' },
  ];

  readonly serieOptions = computed<SelectOption[]>(() => {
    const set = new Set<string>();
    this.salasService.salas().forEach((s) =>
      TURNOS.forEach((t) => {
        const turma = s.turnos[t];
        if (turma) set.add(this.salasService.serieFromNome(turma.nome));
      }),
    );
    return [
      { value: 'todas', label: 'Todas as séries' },
      ...Array.from(set).sort().map((s) => ({ value: s, label: s })),
    ];
  });

  private matchesFiltro = (salaId: string): boolean => {
    const sala = this.salasService.sala(salaId);
    if (!sala) return false;
    return TURNOS.some((t) => {
      const turma = sala.turnos[t];
      if (!turma) return false;
      if (this.segmento() !== 'todas' && this.salasService.segmentoFromNome(turma.nome) !== this.segmento())
        return false;
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
    return Math.min(100, Math.round((sala.carteiras / cap) * 100));
  });

  readonly deskSlots = computed<DeskSlot[]>(() => {
    const sala = this.sala();
    if (!sala) return [];
    const cap = this.capacidade();
    const turma = this.turmaAtual();
    const alunos = turma?.alunos ?? 0;
    const totalSlots = Math.max(cap, sala.carteiras, alunos);
    const slots: DeskSlot[] = [];
    for (let i = 0; i < totalSlots; i++) {
      let kind: DeskKind;
      let icon: string;
      let tooltip: string;
      if (i < Math.min(alunos, sala.carteiras)) {
        kind = 'aluno';
        icon = 'person';
        tooltip = 'Carteira ocupada por aluno';
      } else if (i < sala.carteiras) {
        kind = 'vaga';
        icon = 'event_seat';
        tooltip = 'Carteira vaga neste turno';
      } else if (i < cap) {
        kind = 'livre';
        icon = 'add';
        tooltip = 'Espaço físico sem carteira';
      } else {
        kind = 'excedente';
        icon = 'priority_high';
        tooltip = 'Além da capacidade calculada';
      }
      slots.push({ index: i, kind, icon, tooltip, draggable: this.uiMode.editorMode() && kind === 'vaga' });
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

  readonly hasSelectedDesk = computed(() => this.selectedDesk() !== null);

  onUnidadeChange(uid: string): void {
    this.unidadeId.set(uid);
    const first = this.salasService.salasDaUnidade(uid)[0];
    this.salaId.set(first ? first.id : '');
    this.selectedDesk.set(null);
  }

  onSalaChange(id: string): void {
    this.salaId.set(id);
    this.selectedDesk.set(null);
  }

  onSegmentoChange(v: string): void {
    this.segmento.set(v);
    this.selectedDesk.set(null);
  }
  onSerieChange(v: string): void {
    this.serie.set(v);
    this.selectedDesk.set(null);
  }

  toggleDesk(slot: DeskSlot): void {
    if (!slot.draggable) return;
    this.selectedDesk.set(this.selectedDesk() === slot.index ? null : slot.index);
  }

  onDeskDragStart(event: DragEvent, slot: DeskSlot): void {
    if (!slot.draggable) return;
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(slot.index));
    }
    this.selectedDesk.set(slot.index);
    this.isDraggingDesk.set(true);
  }

  onDeskDragEnd(): void {
    this.isDraggingDesk.set(false);
    this.dragOverSalaId.set(null);
  }

  onRoomDragOver(event: DragEvent, roomId: string): void {
    if (!this.isDraggingDesk()) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    if (this.dragOverSalaId() !== roomId) this.dragOverSalaId.set(roomId);
  }
  onRoomDragLeave(): void {
    this.dragOverSalaId.set(null);
  }
  onRoomDrop(event: DragEvent, roomId: string): void {
    event.preventDefault();
    const sala = this.sala();
    if (!sala) return;
    this.salasService.moveCarteira(sala.id, roomId, this.uiMode.editorMode());
    this.dragOverSalaId.set(null);
    this.selectedDesk.set(null);
    this.isDraggingDesk.set(false);
  }

  moverParaCa(roomId: string): void {
    const sala = this.sala();
    if (!sala) return;
    this.salasService.moveCarteira(sala.id, roomId, this.uiMode.editorMode());
    this.selectedDesk.set(null);
  }
}
