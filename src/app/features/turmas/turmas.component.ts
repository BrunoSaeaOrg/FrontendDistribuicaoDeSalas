import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SalasService } from '../../core/services/salas.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { Turno, TurmaLivre } from '../../core/models';
import { CardComponent } from '../../shared/ui/card/card.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

interface TurmaCell {
  turno: Turno;
  hasTurma: boolean;
  noTurma: boolean;
  nome: string;
  nomeProprio: string;
  alunos: number;
  excede: boolean;
  turmasLivres: TurmaLivre[];
}

interface TurmaRow {
  id: string;
  unidadeId: string;
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
  private readonly confirmDialog = inject(ConfirmDialogService);
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
          turmasLivres: this.salasService.turmasLivresPara(s, turno),
        };
      });
      return { id: s.id, unidadeId: s.unidadeId, nome: s.nome, unidadeNome: u.nome, unidadeCor: u.cor, carteiras: s.carteiras, cells };
    });
  });

  turmaLivreOptions(cell: TurmaCell): SelectOption[] {
    return [
      { value: '', label: 'Selecione uma turma...' },
      ...cell.turmasLivres.map((t) => ({ value: t.codTurma, label: `${t.nome} (${t.alunos} alunos)` })),
    ];
  }

  async liberar(row: TurmaRow, cell: TurmaCell): Promise<void> {
    const sala = this.salasService.sala(row.id);
    if (!sala) return;
    const ok = await this.confirmDialog.confirm({
      title: 'Liberar turma da sala?',
      description: `${cell.nomeProprio} deixará de ocupar ${row.nome} no turno da ${cell.turno === 'manha' ? 'manhã' : 'tarde'}.`,
      confirmLabel: 'Liberar',
      danger: true,
    });
    if (ok) this.salasService.liberarTurno(sala, cell.turno);
  }

  vincular(row: TurmaRow, cell: TurmaCell, codTurma: string): void {
    if (!codTurma) return;
    const sala = this.salasService.sala(row.id);
    const turma = cell.turmasLivres.find((t) => t.codTurma === codTurma);
    if (!sala || !turma) return;
    this.salasService.vincularTurno(sala, turma);
  }
}
