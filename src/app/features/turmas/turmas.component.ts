import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SalasService } from '../../core/services/salas.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { Turno } from '../../core/models';
import { CardComponent } from '../../shared/ui/card/card.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

interface TurmaCell {
  turno: Turno;
  hasTurma: boolean;
  noTurma: boolean;
  nome: string;
  nomeProprio: string;
  alunos: number;
  excede: boolean;
}

interface TurmaRow {
  id: string;
  nome: string;
  unidadeNome: string;
  unidadeCor: string;
  carteiras: number;
  cells: TurmaCell[];
}

const TURNOS: Turno[] = ['manha', 'tarde'];

@Component({
  selector: 'app-turmas',
  standalone: true,
  imports: [FormsModule, CardComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './turmas.component.html',
  styleUrl: './turmas.component.css',
})
export class TurmasComponent {
  private readonly salasService = inject(SalasService);
  readonly uiMode = inject(UiModeService);

  readonly unidade = signal('todas');

  readonly unidadeOptions = computed<SelectOption[]>(() => [
    { value: 'todas', label: 'Todas as unidades' },
    ...this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  ]);

  readonly rows = computed<TurmaRow[]>(() => {
    const unidade = this.unidade();
    let list = this.salasService.salas();
    if (unidade !== 'todas') list = list.filter((s) => s.unidadeId === unidade);

    return list.map((s) => {
      const u = this.salasService.unidade(s.unidadeId)!;
      const cells: TurmaCell[] = TURNOS.map((turno) => {
        const t = s.turnos[turno];
        return {
          turno,
          hasTurma: !!t,
          noTurma: !t,
          nome: t?.nome ?? '',
          nomeProprio: t?.nomeProprio ?? '',
          alunos: t?.alunos ?? 0,
          excede: !!t && t.alunos > s.carteiras,
        };
      });
      return { id: s.id, nome: s.nome, unidadeNome: u.nome, unidadeCor: u.cor, carteiras: s.carteiras, cells };
    });
  });

  onNomeProprioChange(salaId: string, turno: Turno, value: string): void {
    this.salasService.setTurmaField(salaId, turno, 'nomeProprio', value);
  }
  onNomeChange(salaId: string, turno: Turno, value: string): void {
    this.salasService.setTurmaField(salaId, turno, 'nome', value);
  }
  onAlunosChange(salaId: string, turno: Turno, value: string): void {
    this.salasService.setTurmaField(salaId, turno, 'alunos', value);
  }
  liberar(salaId: string, turno: Turno): void {
    this.salasService.liberarTurno(salaId, turno);
  }
  vincular(salaId: string, turno: Turno): void {
    this.salasService.vincularTurno(salaId, turno);
  }
}
