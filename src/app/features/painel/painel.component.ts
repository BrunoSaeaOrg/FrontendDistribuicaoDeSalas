import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SalasService } from '../../core/services/salas.service';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { InputComponent } from '../../shared/ui/input/input.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

interface TurnoChip {
  turno: 'manha' | 'tarde';
  label: string;
  turma: string;
  hasTurma: boolean;
}

interface PainelRow {
  id: string;
  unidadeId: string;
  nome: string;
  unidadeNome: string;
  unidadeCor: string;
  tipo: string;
  carteiras: number;
  capacidade: number;
  /** Alunos do turno mais cheio: é o número que o status compara com a capacidade. */
  alunos: number;
  alunosTitle: string;
  statusLabel: string;
  statusTone: 'success' | 'warning' | 'danger';
  statusKey: string;
  turnoChips: TurnoChip[];
}

@Component({
  selector: 'app-painel',
  standalone: true,
  imports: [FormsModule, BadgeComponent, CardComponent, EmptyStateComponent, InputComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './painel.component.html',
  styleUrl: './painel.component.css',
})
export class PainelComponent {
  private readonly salasService = inject(SalasService);
  private readonly router = inject(Router);

  readonly unidade = signal('todas');
  readonly turno = signal('todas');
  readonly status = signal('todas');
  readonly busca = signal('');

  /**
   * Ano letivo da ocupação: os anos vêm do RM (API.OC.SAL.ANO), e trocar recarrega as salas do
   * período letivo daquele ano (API.OC.SAL.PERIO) e as turmas dele.
   */
  readonly anoLetivo = this.salasService.anoLetivo;
  readonly anoLetivoOptions = computed<SelectOption[]>(() =>
    this.salasService.anosLetivos().map((ano) => ({ value: ano, label: ano })),
  );
  /** O ano carregou sem sala nenhuma: não há período letivo aberto nele (não é filtro). */
  readonly semSalasNoAno = computed(() => !this.salasService.loading() && this.salasService.salas().length === 0);

  selecionarAno(ano: string): void {
    this.salasService.selecionarAno(ano);
  }

  readonly unidadeOptions = computed<SelectOption[]>(() => [
    { value: 'todas', label: 'Todas as unidades' },
    ...this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  ]);
  readonly turnoOptions: SelectOption[] = [
    { value: 'todas', label: 'Todos os turnos' },
    { value: 'manha', label: 'Manhã' },
    { value: 'tarde', label: 'Tarde' },
  ];
  readonly statusOptions: SelectOption[] = [
    { value: 'todas', label: 'Todos os status' },
    { value: 'disponivel', label: 'Disponível' },
    { value: 'quase', label: 'Quase lotada' },
    { value: 'excedida', label: 'Excedida' },
  ];

  readonly unidadesOverview = computed(() =>
    this.salasService.unidades().map((u) => {
      const uSalas = this.salasService.salasDaUnidade(u.id);
      const ocupados = uSalas.reduce(
        (a, s) => a + Math.max(this.salasService.alunosNoTurno(s, 'manha'), this.salasService.alunosNoTurno(s, 'tarde')),
        0,
      );
      const cap = uSalas.reduce((a, s) => a + this.salasService.capacidade(s), 0);
      const pct = cap > 0 ? Math.round((ocupados / cap) * 100) : 0;
      return { id: u.id, nome: u.nome.toUpperCase(), cor: u.cor, pct, salas: uSalas.length };
    }),
  );

  private readonly allRows = computed<PainelRow[]>(() =>
    this.salasService.salas().map((s) => {
      const u = this.salasService.unidade(s.unidadeId)!;
      const cap = this.salasService.capacidade(s);
      const info = this.salasService.statusInfo(s);
      const turnoChips: TurnoChip[] = (['manha', 'tarde'] as const).map((t) => {
        // Mais de uma turma no turno: uma por linha na dica do chip.
        const turmas = this.salasService.turmasNoTurno(s, t);
        return {
          turno: t,
          label: t === 'manha' ? 'M' : 'T',
          turma: turmas.length ? turmas.map((x) => `${x.nome} · ${x.alunos} alunos`).join('\n') : 'Livre',
          hasTurma: turmas.length > 0,
        };
      });
      const alunosManha = this.salasService.alunosNoTurno(s, 'manha');
      const alunosTarde = this.salasService.alunosNoTurno(s, 'tarde');
      return {
        id: s.id,
        unidadeId: s.unidadeId,
        nome: s.nome,
        unidadeNome: u.nome,
        unidadeCor: u.cor,
        tipo: s.tipo,
        carteiras: s.carteiras,
        capacidade: cap,
        alunos: Math.max(alunosManha, alunosTarde),
        alunosTitle: `Manhã: ${alunosManha} · Tarde: ${alunosTarde}`,
        statusLabel: info.label,
        statusTone: info.tone,
        statusKey: info.key,
        turnoChips,
      };
    }),
  );

  readonly rows = computed(() => {
    let rows = this.allRows();
    const unidade = this.unidade();
    const turno = this.turno();
    const status = this.status();
    const busca = this.busca().trim().toLowerCase();

    if (unidade !== 'todas') rows = rows.filter((r) => r.unidadeId === unidade);
    if (turno !== 'todas') {
      rows = rows.filter((r) => {
        const chip = r.turnoChips.find((c) => c.turno === turno);
        return chip?.hasTurma;
      });
    }
    if (status !== 'todas') rows = rows.filter((r) => r.statusKey === status);
    if (busca) {
      rows = rows.filter(
        (r) => r.nome.toLowerCase().includes(busca) || r.unidadeNome.toLowerCase().includes(busca),
      );
    }
    return rows;
  });

  toggleUnidade(id: string): void {
    this.unidade.set(this.unidade() === id ? 'todas' : id);
  }

  verPlanta(row: PainelRow): void {
    this.router.navigate(['planta'], { queryParams: { unidade: row.unidadeId, sala: row.id } });
  }
}
