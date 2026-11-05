import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { nomeDoAndar, Turno, unidadeNoFiltro } from '../../core/models';
import { SalasService } from '../../core/services/salas.service';
import { BadgeTone } from '../../shared/ui/badge/badge.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { InputComponent } from '../../shared/ui/input/input.component';
import { MultiSelectComponent, MultiSelectOption } from '../../shared/ui/multi-select/multi-select.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

interface TurnoChip {
  turno: 'manha' | 'tarde';
  label: string;
  /** Dica: o status do turno e as turmas dele, uma por linha; "Livre" sem turma. */
  turma: string;
  hasTurma: boolean;
  /** A cor do status da sala naquele turno, a mesma do badge; null = turno sem turma (cinza). */
  tom: BadgeTone | null;
  /** O status em texto ("Manhã: Quase lotada"), para leitor de tela: a cor sozinha não basta. */
  rotulo: string;
}

/** Uma coluna de Período: os alunos da sala naquele turno; null = sem turma no turno. */
interface PeriodoCell {
  turno: 'manha' | 'tarde';
  alunos: number | null;
  /** As turmas do turno, uma por linha. */
  dica: string;
}

interface PainelRow {
  id: string;
  unidadeId: string;
  nome: string;
  unidadeNome: string;
  unidadeCor: string;
  /** Andar por extenso ("Térreo", "1º andar"). */
  andar: string;
  tipo: string;
  carteiras: number;
  capacidade: number;
  /** Manhã e Tarde, nessa ordem. */
  periodos: PeriodoCell[];
  /**
   * Status da sala no turno do filtro ou, em "Todos os turnos", no mais cheio (o pior dos dois).
   * Não tem coluna própria (as letras de Turmas mostram cada turno): serve ao filtro de Status.
   */
  statusKey: string;
  turnoChips: TurnoChip[];
}

@Component({
  selector: 'app-painel',
  standalone: true,
  imports: [
    FormsModule,
    CardComponent,
    CarregandoComponent,
    EmptyStateComponent,
    InputComponent,
    MultiSelectComponent,
    SelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './painel.component.html',
  styleUrl: './painel.component.css',
})
export class PainelComponent {
  private readonly salasService = inject(SalasService);
  private readonly router = inject(Router);

  /** Unidades marcadas (cada uma é uma filial do RM, ex.: "CASJ 1"); nenhuma = todas. */
  readonly unidades = signal<string[]>([]);
  readonly turno = signal('todas');
  readonly status = signal('todas');
  readonly busca = signal('');

  /**
   * Ano letivo da ocupação: os anos vêm do RM (API.OC.SAL.ANO), e trocar recarrega as salas do
   * período letivo daquele ano (API.OC.SAL.PERIO) e as turmas dele.
   */
  readonly anoLetivo = this.salasService.anoLetivo;
  /** O ano escolhido ainda está vindo do RM: spinner no campo do ano e véu sobre o conteúdo. */
  readonly carregando = this.salasService.loading;
  readonly trocandoAno = this.salasService.trocandoAno;
  readonly anoLetivoOptions = computed<SelectOption[]>(() =>
    this.salasService.anosLetivos().map((ano) => ({ value: ano, label: ano })),
  );
  /** O ano carregou sem sala nenhuma: não há período letivo aberto nele (não é filtro). */
  readonly semSalasNoAno = computed(() => !this.salasService.loading() && this.salasService.salas().length === 0);

  selecionarAno(ano: string): void {
    this.salasService.selecionarAno(ano);
  }

  readonly unidadeOptions = computed<MultiSelectOption[]>(() =>
    this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  );

  /** Pelo campo ou pelos chips de unidade. */
  selecionarUnidades(unidades: string[]): void {
    this.unidades.set(unidades);
  }
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

  /** Turno do filtro; undefined em "Todos os turnos" (vale o turno mais cheio de cada sala). */
  readonly turnoFiltrado = computed<Turno | undefined>(() => {
    const turno = this.turno();
    return turno === 'manha' || turno === 'tarde' ? turno : undefined;
  });

  readonly unidadesOverview = computed(() =>
    this.salasService.unidades().map((u) => {
      const uSalas = this.salasService.salasDaUnidade(u.id);
      const turno = this.turnoFiltrado();
      const ocupados = uSalas.reduce((a, s) => a + this.salasService.alunosNaSala(s, turno), 0);
      const cap = uSalas.reduce((a, s) => a + this.salasService.capacidade(s), 0);
      const pct = cap > 0 ? Math.round((ocupados / cap) * 100) : 0;
      return { id: u.id, nome: u.nome.toUpperCase(), cor: u.cor, pct, salas: uSalas.length };
    }),
  );

  /**
   * Alunos mostra os de manhã e os da tarde, cada um na sua coluna, e as letras de Turmas têm a cor
   * do status de cada turno. O filtro de Status usa o do turno filtrado ou, em "Todos os turnos", o
   * do turno mais cheio, que é o que lota a sala.
   */
  private readonly allRows = computed<PainelRow[]>(() => {
    const turno = this.turnoFiltrado();
    return this.salasService.salas().map((s) => {
      const u = this.salasService.unidade(s.unidadeId)!;
      const cap = this.salasService.capacidade(s);
      const porTurno = (['manha', 'tarde'] as const).map((t) => {
        const turmas = this.salasService.turmasNoTurno(s, t);
        // Mais de uma turma no turno: uma por linha na dica.
        const dica = turmas.length ? turmas.map((x) => `${x.nome} · ${x.alunos} alunos`).join('\n') : 'Livre';
        return { turno: t, turmas, dica };
      });
      // Cada letra na cor do status da sala naquele turno.
      const turnoChips: TurnoChip[] = porTurno.map(({ turno: t, turmas, dica }) => {
        const status = turmas.length ? this.salasService.statusInfo(s, t) : null;
        const rotulo = `${t === 'manha' ? 'Manhã' : 'Tarde'}: ${status ? status.label : 'livre'}`;
        return {
          turno: t,
          label: t === 'manha' ? 'M' : 'T',
          turma: status ? `${rotulo}\n${dica}` : dica,
          hasTurma: turmas.length > 0,
          tom: status?.tone ?? null,
          rotulo,
        };
      });
      const periodos: PeriodoCell[] = porTurno.map(({ turno: t, turmas, dica }) => ({
        turno: t,
        alunos: turmas.length ? this.salasService.alunosNoTurno(s, t) : null,
        dica: turmas.length ? dica : 'Sem turma',
      }));
      return {
        id: s.id,
        unidadeId: s.unidadeId,
        nome: s.nome,
        unidadeNome: u.nome,
        unidadeCor: u.cor,
        andar: nomeDoAndar(s.andar),
        tipo: s.tipo,
        carteiras: s.carteiras,
        capacidade: cap,
        periodos,
        statusKey: this.salasService.statusInfo(s, turno).key,
        turnoChips,
      };
    });
  });

  readonly rows = computed(() => {
    let rows = this.allRows();
    const unidades = this.unidades();
    const turno = this.turno();
    const status = this.status();
    const busca = this.busca().trim().toLowerCase();

    rows = rows.filter((r) => unidadeNoFiltro(unidades, r.unidadeId));
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

  /** O chip marca ou desmarca a unidade no campo, como o checkbox dela. */
  toggleUnidade(id: string): void {
    const atual = this.unidades();
    this.selecionarUnidades(atual.includes(id) ? atual.filter((u) => u !== id) : [...atual, id]);
  }

  verPlanta(row: PainelRow): void {
    this.router.navigate(['planta'], { queryParams: { unidade: row.unidadeId, sala: row.id } });
  }
}
