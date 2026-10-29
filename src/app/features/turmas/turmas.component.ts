import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SaeaSpinnerComponent,
  SaeaTagComponent,
  SaeaTooltipDirective,
  SaeaTruncateComponent,
} from '@sistemas-saea/saea-design-system';
import { SalasService } from '../../core/services/salas.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { Turno, TurmaVinculada } from '../../core/models';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { InputComponent } from '../../shared/ui/input/input.component';
import { MultiSelectComponent, MultiSelectOption } from '../../shared/ui/multi-select/multi-select.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

/** Turma que dá para vincular numa célula: sem sala, ou em outra sala (vincular a move). */
interface OpcaoTurma {
  /** codTurma|idPerlet: valor no seletor e nas tags. */
  valor: string;
  codTurma: string;
  idPerlet: number;
  nome: string;
  alunos: number;
  /** Sala em que a turma está hoje; sem ela, a turma está sem sala. */
  salaAtual?: string;
  /** Nome na tag, sem o turno da coluna (ver nomeNoTurno). */
  nomeCurto: string;
}

/** Turma vinculada como chip: nome sem o turno da coluna, e o completo para o tooltip do corte. */
interface ChipTurma {
  turma: TurmaVinculada;
  nome: string;
  titulo: string;
}

/** Lista em chips na horizontal: as primeiras ficam à vista, o resto vira "+N" até abrir. */
interface ListaChips<T> {
  visiveis: T[];
  ocultas: T[];
  /** Aberta pelo "+N": mostra todas, com a opção de recolher. */
  aberta: boolean;
  /** Dica do "+N": os nomes que estão escondidos. */
  resumoOcultas: string;
}

interface TurmaCell {
  turno: Turno;
  /** salaId|turno: chave da seleção desta célula. */
  chave: string;
  turmas: TurmaVinculada[];
  vinculadas: ListaChips<ChipTurma>;
  marcadas: ListaChips<OpcaoTurma>;
  alunos: number;
  excede: boolean;
  opcoes: OpcaoTurma[];
  opcoesSeletor: MultiSelectOption[];
  /** Marcadas no seletor e ainda não gravadas, na ordem em que foram marcadas. */
  selecionadas: OpcaoTurma[];
  valoresSelecionados: string[];
  /** Alunos do turno se as marcadas forem vinculadas. */
  alunosComSelecionadas: number;
  excedeComSelecionadas: boolean;
  /** O RM está gravando o vínculo das marcadas: o spinner fica no lugar do seletor. */
  vinculando: { atual: number; total: number } | null;
  /** Turma que o RM está liberando: o spinner fica no lugar do "Liberar" dela. */
  liberando: string | null;
}

interface TurmaRow {
  id: string;
  unidadeId: string;
  nome: string;
  unidadeNome: string;
  unidadeCor: string;
  /** Andar por extenso ("Térreo", "1º andar"). */
  andar: string;
  carteiras: number;
  cells: TurmaCell[];
}

const TURNOS: Turno[] = ['manha', 'tarde'];

/** ANDAR do RM por extenso: "T" é o térreo e os outros vêm só com o número ("1" → "1º andar"). */
function nomeDoAndar(andar: string): string {
  if (!andar) return '—';
  if (/^t$/i.test(andar)) return 'Térreo';
  return /^\d+$/.test(andar) ? `${andar}º andar` : andar;
}

const NOME_TURNO: Record<Turno, string> = { manha: 'manhã', tarde: 'tarde' };

/** Colunas que dá para ordenar clicando no cabeçalho. */
type ColunaOrdem = 'sala' | 'carteiras';

/** "Sala 2" antes de "Sala 10", sem diferenciar maiúsculas nem acentos. */
const COMPARADOR_NOME = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

const valorDaTurma = (t: { codTurma: string; idPerlet: number }) => `${t.codTurma}|${t.idPerlet}`;

/** "1 aluno", "0 alunos", "23 alunos". */
const qtdAlunos = (n: number) => `${n} ${n === 1 ? 'aluno' : 'alunos'}`;

/** Chips à vista antes do "+N". */
const CHIPS_VISIVEIS = 3;

const SUFIXO_DO_TURNO: Record<Turno, RegExp> = {
  manha: /\s*-\s*manh[ãa]\s*$/iu,
  tarde: /\s*-\s*tarde\s*$/iu,
};

/**
 * No chip, o turno já é o da coluna, e o corte com "…" comeria justamente o fim do nome, que é o
 * que diferencia as turmas: "3º Ano C - Manhã" → "3º Ano C", "3º Ano C - Semi-Manhã" → "3º Ano C - Semi".
 */
function nomeNoTurno(nome: string, turno: Turno): string {
  return nome.replace(SUFIXO_DO_TURNO[turno], '') || nome;
}

function emChips<T>(lista: T[], aberta: boolean, rotulo: (item: T) => string): ListaChips<T> {
  if (lista.length <= CHIPS_VISIVEIS) return { visiveis: lista, ocultas: [], aberta: false, resumoOcultas: '' };
  if (aberta) return { visiveis: lista, ocultas: [], aberta: true, resumoOcultas: '' };
  const ocultas = lista.slice(CHIPS_VISIVEIS);
  return {
    visiveis: lista.slice(0, CHIPS_VISIVEIS),
    ocultas,
    aberta: false,
    resumoOcultas: ocultas.map(rotulo).join(', '),
  };
}

@Component({
  selector: 'app-turmas',
  standalone: true,
  imports: [
    FormsModule,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    InputComponent,
    MultiSelectComponent,
    SelectComponent,
    SaeaSpinnerComponent,
    SaeaTagComponent,
    SaeaTooltipDirective,
    SaeaTruncateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './turmas.component.html',
  styleUrl: './turmas.component.css',
})
export class TurmasComponent {
  private readonly salasService = inject(SalasService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly uiMode = inject(UiModeService);

  readonly unidade = signal('todas');
  /** Parte do nome da sala. */
  readonly buscaSala = signal('');
  readonly segmento = signal('todas');
  readonly serie = signal('todas');

  /** Ano letivo dos vínculos: os anos vêm do RM, e trocar recarrega as turmas daquele ano. */
  readonly anoLetivo = this.salasService.anoLetivo;
  readonly anoLetivoOptions = computed<SelectOption[]>(() =>
    this.salasService.anosLetivos().map((ano) => ({ value: ano, label: ano })),
  );

  selecionarAno(ano: string): void {
    this.salasService.selecionarAno(ano);
  }

  /** Gravação em andamento: trava vincular/liberar até o RM terminar (evita gravar duas vezes). */
  readonly salvando = this.salasService.salvando;

  readonly qtdAlunos = qtdAlunos;

  /** Turmas marcadas em cada célula (chave salaId|turno), antes do "Confirmar". */
  private readonly selecao = signal<Record<string, string[]>>({});

  /** Listas de chips abertas pelo "+N" (chave salaId|turno|vinculadas ou |marcadas). */
  private readonly listasAbertas = signal<ReadonlySet<string>>(new Set());

  /** Ordenação pelo cabeçalho; null = a ordem em que as salas vêm do RM. */
  readonly ordem = signal<{ coluna: ColunaOrdem; direcao: 'asc' | 'desc' } | null>(null);

  readonly unidadeOptions = computed<SelectOption[]>(() => [
    { value: 'todas', label: 'Todas as unidades' },
    ...this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  ]);

  readonly segmentoOptions = computed<SelectOption[]>(() => [
    { value: 'todas', label: 'Todos os segmentos' },
    ...this.salasService.segmentos().map((s) => ({ value: s, label: s })),
  ]);

  /** Séries das turmas (vinculadas e sem sala); com um segmento escolhido, só as dele. */
  readonly serieOptions = computed<SelectOption[]>(() => {
    const segmento = this.segmento();
    const series = new Set<string>();
    const considerar = (t: { nome: string; segmento: string }) => {
      if (segmento === 'todas' || t.segmento === segmento) series.add(this.salasService.serieFromNome(t.nome));
    };
    this.salasService.salas().forEach((s) => TURNOS.forEach((turno) => this.salasService.turmasNoTurno(s, turno).forEach(considerar)));
    this.salasService.turmasLivres().forEach(considerar);
    return [
      { value: 'todas', label: 'Todas as séries' },
      ...[...series].sort(COMPARADOR_NOME.compare).map((s) => ({ value: s, label: s })),
    ];
  });

  /** Outro segmento tem outras séries: a escolhida volta para "Todas". */
  selecionarSegmento(segmento: string): void {
    this.segmento.set(segmento);
    this.serie.set('todas');
  }

  readonly rows = computed<TurmaRow[]>(() => {
    const unidade = this.unidade();
    const busca = this.buscaSala().trim().toLowerCase();
    const segmento = this.segmento();
    const serie = this.serie();
    const gravando = this.salasService.gravando();
    const selecao = this.selecao();
    const abertas = this.listasAbertas();
    let list = this.salasService.salas();
    if (unidade !== 'todas') list = list.filter((s) => s.unidadeId === unidade);
    if (busca) list = list.filter((s) => s.nome.toLowerCase().includes(busca));
    // Segmento e série são das turmas: fica a sala que tem, em algum turno, uma turma que atende os dois.
    if (segmento !== 'todas' || serie !== 'todas') {
      list = list.filter((s) =>
        TURNOS.some((turno) =>
          this.salasService
            .turmasNoTurno(s, turno)
            .some(
              (t) =>
                (segmento === 'todas' || t.segmento === segmento) &&
                (serie === 'todas' || this.salasService.serieFromNome(t.nome) === serie),
            ),
        ),
      );
    }

    const rows = list.map((s) => {
      const u = this.salasService.unidade(s.unidadeId)!;
      const cells: TurmaCell[] = TURNOS.map((turno) => {
        const chave = `${s.id}|${turno}`;
        const turmas = this.salasService.turmasNoTurno(s, turno);
        const alunos = this.salasService.alunosNoTurno(s, turno);
        // Primeiro as turmas sem sala; depois as que estão em outra sala.
        const opcoes: OpcaoTurma[] = [
          ...this.salasService.turmasLivresPara(s, turno),
          ...this.salasService.turmasEmOutraSalaPara(s, turno),
        ].map((t) => ({
          valor: valorDaTurma(t),
          codTurma: t.codTurma,
          idPerlet: t.idPerlet,
          nome: t.nome,
          alunos: t.alunos,
          salaAtual: 'salaAtual' in t ? t.salaAtual : undefined,
          nomeCurto: nomeNoTurno(t.nome, turno),
        }));
        // Uma marcada que deixou de estar disponível (a carga mudou) sai da seleção.
        const selecionadas = (selecao[chave] ?? [])
          .map((valor) => opcoes.find((o) => o.valor === valor))
          .filter((o): o is OpcaoTurma => !!o);
        const alunosComSelecionadas = selecionadas.reduce((total, o) => total + o.alunos, alunos);
        const daCelula = gravando?.salaId === s.id && gravando.turno === turno ? gravando : null;
        return {
          turno,
          chave,
          turmas,
          vinculadas: emChips(
            turmas.map((t) => ({
              turma: t,
              nome: nomeNoTurno(t.nomeProprio, turno),
              titulo: `${t.nomeProprio} · ${qtdAlunos(t.alunos)}`,
            })),
            abertas.has(`${chave}|vinculadas`),
            (c) => `${c.nome} · ${c.turma.alunos} al.`,
          ),
          marcadas: emChips(selecionadas, abertas.has(`${chave}|marcadas`), (o) => o.nomeCurto),
          alunos,
          excede: alunos > s.carteiras,
          opcoes,
          opcoesSeletor: opcoes.map((o) => ({
            value: o.valor,
            label: `${o.nome} · ${qtdAlunos(o.alunos)}`,
            hint: o.salaAtual ? `hoje em ${o.salaAtual}` : undefined,
            group: o.salaAtual ? 'Em outra sala' : 'Sem sala',
          })),
          selecionadas,
          valoresSelecionados: selecionadas.map((o) => o.valor),
          alunosComSelecionadas,
          excedeComSelecionadas: alunosComSelecionadas > s.carteiras,
          vinculando:
            daCelula && !daCelula.codTurma ? { atual: daCelula.atual ?? 1, total: daCelula.total ?? 1 } : null,
          liberando: daCelula?.codTurma ?? null,
        };
      });
      return {
        id: s.id,
        unidadeId: s.unidadeId,
        nome: s.nome,
        unidadeNome: u.nome,
        unidadeCor: u.cor,
        andar: nomeDoAndar(s.andar),
        carteiras: s.carteiras,
        cells,
      };
    });

    const ordem = this.ordem();
    if (!ordem) return rows;
    const sinal = ordem.direcao === 'asc' ? 1 : -1;
    // Empate em carteiras desempata pelo nome da sala, sempre em ordem crescente.
    return [...rows].sort((a, b) =>
      ordem.coluna === 'carteiras'
        ? (a.carteiras - b.carteiras) * sinal || COMPARADOR_NOME.compare(a.nome, b.nome)
        : COMPARADOR_NOME.compare(a.nome, b.nome) * sinal,
    );
  });

  /** Clique no cabeçalho: a mesma coluna inverte o sentido; outra começa crescente. */
  ordenarPor(coluna: ColunaOrdem): void {
    this.ordem.update((atual) =>
      atual?.coluna === coluna
        ? { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        : { coluna, direcao: 'asc' },
    );
  }

  /** aria-sort do cabeçalho: só a coluna ordenada recebe o atributo. */
  ariaOrdem(coluna: ColunaOrdem): 'ascending' | 'descending' | null {
    const ordem = this.ordem();
    if (ordem?.coluna !== coluna) return null;
    return ordem.direcao === 'asc' ? 'ascending' : 'descending';
  }

  iconeOrdem(coluna: ColunaOrdem): string {
    const ordem = this.ordem();
    if (ordem?.coluna !== coluna) return 'unfold_more';
    return ordem.direcao === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  selecionar(cell: TurmaCell, valores: string[]): void {
    this.selecao.update((atual) => ({ ...atual, [cell.chave]: valores }));
  }

  desmarcar(cell: TurmaCell, valor: string): void {
    this.selecionar(
      cell,
      cell.valoresSelecionados.filter((v) => v !== valor),
    );
  }

  limpar(cell: TurmaCell): void {
    this.selecionar(cell, []);
  }

  /** "+N" abre a lista inteira; o botão de recolher volta às primeiras. */
  alternarLista(chave: string): void {
    this.listasAbertas.update((atual) => {
      const proximas = new Set(atual);
      if (!proximas.delete(chave)) proximas.add(chave);
      return proximas;
    });
  }

  async liberar(row: TurmaRow, cell: TurmaCell, turma: TurmaVinculada): Promise<void> {
    const sala = this.salasService.sala(row.id);
    if (!sala) return;
    const ok = await this.confirmDialog.confirm({
      title: 'Liberar turma da sala?',
      description: `${turma.nomeProprio} deixará de ocupar ${row.nome} no turno da ${NOME_TURNO[cell.turno]}.`,
      confirmLabel: 'Liberar',
      danger: true,
    });
    if (ok) this.salasService.liberarTurma(sala, cell.turno, turma);
  }

  /**
   * Grava as turmas marcadas na sala. Turma livre vai direto; se alguma está em outra sala, pede
   * confirmação antes, porque ela sai de lá. As que falharem continuam marcadas.
   */
  async confirmar(row: TurmaRow, cell: TurmaCell): Promise<void> {
    const sala = this.salasService.sala(row.id);
    const escolhidas = cell.selecionadas;
    if (!sala || escolhidas.length === 0) return;

    const movidas = escolhidas.filter((t) => t.salaAtual);
    if (movidas.length > 0) {
      const turno = NOME_TURNO[cell.turno];
      const ok = await this.confirmDialog.confirm(
        movidas.length === 1
          ? {
              title: 'Mover turma para esta sala?',
              description: `${movidas[0].nome} sai de ${movidas[0].salaAtual} e passa a ocupar ${row.nome} no turno da ${turno}.`,
              confirmLabel: 'Mover',
            }
          : {
              title: 'Mover turmas para esta sala?',
              description:
                `${movidas.map((t) => `${t.nome} (hoje em ${t.salaAtual})`).join(', ')} saem das salas ` +
                `em que estão e passam a ocupar ${row.nome} no turno da ${turno}.`,
              confirmLabel: 'Mover',
            },
      );
      if (!ok) return;
    }

    const falhas = await this.salasService.vincularTurmas(sala, cell.turno, escolhidas);
    this.selecionar(
      cell,
      falhas.map((t) => t.valor),
    );
  }
}
