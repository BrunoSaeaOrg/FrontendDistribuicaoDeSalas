import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { nomeDoAndar, Turno, unidadeNoFiltro } from '../../core/models';
import { SalasService } from '../../core/services/salas.service';
import type { BadgeTone } from '../../shared/ui/badge/badge.component';
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
  /** A sala está indisponível neste turno no ano. */
  indisponivel: boolean;
  /**
   * A cor do status da sala naquele turno, a mesma do badge; null = turno sem turma (cinza);
   * "indisponivel" = turno indisponível no ano (cinza e riscada).
   */
  tom: BadgeTone | 'indisponivel' | null;
  /** O status em texto ("Manhã: Quase lotada"), para leitor de tela: a cor sozinha não basta. */
  rotulo: string;
}

const TURNOS: Turno[] = ['manha', 'tarde'];

const ROTULO_TURNO: Record<Turno, string> = { manha: 'Manhã', tarde: 'Tarde' };

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
   * Os status em que a sala entra no filtro: o da lotação no turno do filtro ou, em "Todos os
   * turnos", no mais cheio (o pior dos dois); "indisponivel" quando o turno do filtro (ou os dois)
   * está indisponível no ano. Com só um turno indisponível em "Todos os turnos", os dois. Não tem
   * coluna própria (as letras de Turmas mostram cada turno).
   */
  statusKeys: string[];
  turnoChips: TurnoChip[];
  /** A linha em cinza: o turno do filtro (ou, sem filtro, os dois) está indisponível. */
  linhaIndisponivel: boolean;
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
  /** Status marcados no filtro (Disponível, Quase lotada, Excedida); nenhum = todos. */
  readonly status = signal<string[]>([]);
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
  /** Os status do filtro, com checkbox: marcar vários mostra as salas de qualquer um deles. */
  readonly statusOptions: MultiSelectOption[] = [
    { value: 'disponivel', label: 'Disponível' },
    { value: 'quase', label: 'Quase lotada' },
    { value: 'excedida', label: 'Excedida' },
    { value: 'indisponivel', label: 'Indisponível' },
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
      const porTurno = TURNOS.map((t) => {
        const turmas = this.salasService.turmasNoTurno(s, t);
        const motivo = this.salasService.motivoIndisponivel(s, t);
        // Mais de uma turma no turno: uma por linha na dica; indisponível, o motivo antes.
        const dicaTurmas = turmas.length ? turmas.map((x) => `${x.nome} · ${x.alunos} alunos`).join('\n') : '';
        const dica = [motivo ? `Indisponível: ${motivo}` : '', dicaTurmas].filter(Boolean).join('\n') || 'Livre';
        return { turno: t, turmas, motivo, dica };
      });
      // Cada letra na cor do status da sala naquele turno; turno indisponível, em cinza e riscada.
      const turnoChips: TurnoChip[] = porTurno.map(({ turno: t, turmas, motivo, dica }) => {
        const status = turmas.length ? this.salasService.statusInfo(s, t) : null;
        const rotulo = `${ROTULO_TURNO[t]}: ${motivo ? 'indisponível' : status ? status.label : 'livre'}`;
        return {
          turno: t,
          label: t === 'manha' ? 'M' : 'T',
          turma: status && !motivo ? `${rotulo}\n${dica}` : dica,
          hasTurma: turmas.length > 0,
          indisponivel: !!motivo,
          tom: motivo ? 'indisponivel' : (status?.tone ?? null),
          rotulo,
        };
      });
      const periodos: PeriodoCell[] = porTurno.map(({ turno: t, turmas, motivo, dica }) => ({
        turno: t,
        alunos: turmas.length ? this.salasService.alunosNoTurno(s, t) : null,
        dica: turmas.length || motivo ? dica : 'Sem turma',
      }));
      const indisponiveis = porTurno.filter((p) => p.motivo);
      const lotacao = this.salasService.statusInfo(s, turno).key;
      // Com filtro de turno vale aquele turno; em "Todos os turnos", a sala inteira (os dois).
      const linhaIndisponivel = turno ? !!this.salasService.motivoIndisponivel(s, turno) : indisponiveis.length === TURNOS.length;
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
        // Indisponível vale mais que a lotação; com só um turno indisponível, a sala aparece nos dois status.
        statusKeys: linhaIndisponivel ? ['indisponivel'] : indisponiveis.length && !turno ? ['indisponivel', lotacao] : [lotacao],
        turnoChips,
        linhaIndisponivel,
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
      // Fica a sala com turma no turno ou indisponível nele (indisponível, ela não tem turma).
      rows = rows.filter((r) => {
        const chip = r.turnoChips.find((c) => c.turno === turno);
        return chip?.hasTurma || chip?.indisponivel;
      });
    }
    if (status.length > 0) rows = rows.filter((r) => r.statusKeys.some((k) => status.includes(k)));
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
