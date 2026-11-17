import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SaeaButtonComponent,
  SaeaDialogComponent,
  SaeaDialogFooterDirective,
  SaeaSpinnerComponent,
  SaeaTagComponent,
  SaeaTooltipDirective,
  SaeaTruncateComponent,
} from '@sistemas-saea/saea-design-system';
import { motivoDaFalha, SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { espacoParaMotivo, nomeDoAndar, Turno, TurmaVinculada, unidadeNoFiltro } from '../../core/models';
import { AlertComponent } from '../../shared/ui/alert/alert.component';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { InputComponent } from '../../shared/ui/input/input.component';
import { MultiSelectAcao, MultiSelectComponent, MultiSelectOption } from '../../shared/ui/multi-select/multi-select.component';
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
  /** Por que o turno está indisponível no ano; null = disponível. Indisponível, não há turma para vincular. */
  motivoIndisponivel: string | null;
  /** No fim do seletor: marcar o turno como indisponível, ou alterar o motivo e torná-lo disponível. */
  acoes: MultiSelectAcao[];
  /** O RM está gravando o motivo do turno: o spinner fica no lugar do seletor. */
  gravandoMotivo: boolean;
  /** Texto do botão do seletor: o motivo, se o turno está indisponível. */
  textoDoSeletor: string;
}

/** O turno que o diálogo do motivo está marcando (ou alterando). */
interface AlvoDoMotivo {
  salaId: string;
  sala: string;
  unidade: string;
  turno: Turno;
  /** O motivo gravado; null = o turno está disponível e vai ser marcado agora. */
  motivoAtual: string | null;
  /** Turmas vinculadas no turno: continuam na sala, e o diálogo avisa. */
  turmas: string[];
  /** Quantos caracteres cabem no motivo deste turno (o campo do RM é dos dois turnos). */
  limite: number;
}

/** Valores das ações do seletor de cada turno. */
type AcaoDoTurno = 'indisponivel' | 'motivo' | 'disponivel';

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

const NOME_TURNO: Record<Turno, string> = { manha: 'manhã', tarde: 'tarde' };

const ROTULO_TURNO: Record<Turno, string> = { manha: 'Manhã', tarde: 'Tarde' };

/** "a manhã" / "a tarde", para as frases do diálogo e dos avisos. */
const O_TURNO: Record<Turno, string> = { manha: 'a manhã', tarde: 'a tarde' };

function acoesDoTurno(turno: Turno, indisponivel: boolean): MultiSelectAcao[] {
  return indisponivel
    ? [
        { value: 'motivo' satisfies AcaoDoTurno, label: 'Alterar motivo', icon: 'edit' },
        { value: 'disponivel' satisfies AcaoDoTurno, label: `Tornar ${NOME_TURNO[turno]} disponível`, icon: 'event_available' },
      ]
    : [{ value: 'indisponivel' satisfies AcaoDoTurno, label: `Marcar ${NOME_TURNO[turno]} como indisponível`, icon: 'block' }];
}

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
    NgTemplateOutlet,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CarregandoComponent,
    EmptyStateComponent,
    InputComponent,
    MultiSelectComponent,
    SelectComponent,
    SaeaButtonComponent,
    SaeaDialogComponent,
    SaeaDialogFooterDirective,
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
  private readonly toast = inject(ToastService);
  readonly uiMode = inject(UiModeService);

  /** Unidades marcadas (cada uma é uma filial do RM, ex.: "CASJ 1"); nenhuma = todas. */
  readonly unidades = signal<string[]>([]);
  /** Parte do nome da sala. */
  readonly buscaSala = signal('');
  readonly segmento = signal('todas');
  readonly serie = signal('todas');

  /** Ano letivo dos vínculos: os anos vêm do RM, e trocar recarrega as turmas daquele ano. */
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

  /** Gravação em andamento: trava vincular/liberar até o RM terminar (evita gravar duas vezes). */
  readonly salvando = this.salasService.salvando;

  readonly qtdAlunos = qtdAlunos;

  /** Turmas marcadas em cada célula (chave salaId|turno), antes do "Confirmar". */
  private readonly selecao = signal<Record<string, string[]>>({});

  /** Listas de chips abertas pelo "+N" (chave salaId|turno|vinculadas ou |marcadas). */
  private readonly listasAbertas = signal<ReadonlySet<string>>(new Set());

  /** Ordenação pelo cabeçalho; null = a ordem em que as salas vêm do RM. */
  readonly ordem = signal<{ coluna: ColunaOrdem; direcao: 'asc' | 'desc' } | null>(null);

  readonly unidadeOptions = computed<MultiSelectOption[]>(() =>
    this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  );

  selecionarUnidades(unidades: string[]): void {
    this.unidades.set(unidades);
  }

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
    const unidades = this.unidades();
    const busca = this.buscaSala().trim().toLowerCase();
    const segmento = this.segmento();
    const serie = this.serie();
    const gravando = this.salasService.gravando();
    const gravandoMotivo = this.gravandoMotivo();
    const selecao = this.selecao();
    const abertas = this.listasAbertas();
    let list = this.salasService.salas();
    list = list.filter((s) => unidadeNoFiltro(unidades, s.unidadeId));
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
        const motivoIndisponivel = this.salasService.motivoIndisponivel(s, turno);
        // Primeiro as turmas sem sala; depois as que estão em outra sala. Turno indisponível não recebe turma.
        const opcoes: OpcaoTurma[] = (
          motivoIndisponivel
            ? []
            : [...this.salasService.turmasLivresPara(s, turno), ...this.salasService.turmasEmOutraSalaPara(s, turno)]
        ).map((t) => ({
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
          motivoIndisponivel,
          acoes: acoesDoTurno(turno, !!motivoIndisponivel),
          gravandoMotivo: gravandoMotivo === chave,
          textoDoSeletor: motivoIndisponivel
            ? motivoIndisponivel
            : turmas.length > 0 || selecionadas.length > 0
              ? 'Adicionar turma...'
              : opcoes.length > 0
                ? 'Vincular turmas...'
                : 'Nenhuma turma para vincular',
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

  // ------------------------------------------------------------- indisponibilidade ---

  /** O turno do diálogo do motivo. */
  readonly alvoDoMotivo = signal<AlvoDoMotivo | null>(null);
  /** O saea-dialog abre e fecha por aqui ([(open)]). */
  readonly dialogoMotivo = signal(false);
  readonly motivo = signal('');
  /** Célula (salaId|turno) cujo motivo o RM está gravando; null = nenhuma. */
  readonly gravandoMotivo = signal<string | null>(null);

  readonly tituloMotivo = computed(() => {
    const alvo = this.alvoDoMotivo();
    return alvo ? `${ROTULO_TURNO[alvo.turno]} indisponível · ${alvo.sala}` : '';
  });
  /** "a manhã" / "a tarde", para o texto do diálogo. */
  readonly oTurno = computed(() => O_TURNO[this.alvoDoMotivo()?.turno ?? 'manha']);

  /** Uma ação do fim do seletor do turno. */
  aoEscolherAcao(row: TurmaRow, cell: TurmaCell, acao: string): void {
    if (acao === 'disponivel') void this.confirmarDisponivel(row, cell);
    else this.abrirMotivo(row, cell);
  }

  /** Abre o diálogo do turno: com o motivo de agora, se ele já está indisponível. */
  abrirMotivo(row: TurmaRow, cell: TurmaCell): void {
    const sala = this.salasService.sala(row.id);
    if (!sala) return;
    this.alvoDoMotivo.set({
      salaId: row.id,
      sala: row.nome,
      unidade: row.unidadeNome,
      turno: cell.turno,
      motivoAtual: cell.motivoIndisponivel,
      turmas: cell.turmas.map((t) => t.nomeProprio),
      limite: espacoParaMotivo(sala.indisponivel ?? {}, cell.turno),
    });
    this.motivo.set(cell.motivoIndisponivel ?? '');
    this.dialogoMotivo.set(true);
  }

  fecharMotivo(): void {
    if (this.gravandoMotivo()) return;
    this.dialogoMotivo.set(false);
    this.alvoDoMotivo.set(null);
  }

  /** Grava o motivo: o turno fica indisponível no ano letivo em uso. */
  salvarMotivo(): void {
    const alvo = this.alvoDoMotivo();
    const motivo = this.motivo().trim();
    if (alvo && motivo) this.gravarMotivo(alvo.salaId, alvo.turno, motivo, true);
  }

  /** Pelo diálogo: apaga o motivo e o turno volta a ficar disponível. */
  tornarDisponivel(): void {
    const alvo = this.alvoDoMotivo();
    if (alvo) this.gravarMotivo(alvo.salaId, alvo.turno, '', true);
  }

  /** Pelo seletor: confirma antes, porque o motivo gravado se perde. */
  private async confirmarDisponivel(row: TurmaRow, cell: TurmaCell): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: `Tornar ${NOME_TURNO[cell.turno]} disponível?`,
      description: `${row.nome} volta a receber turmas no turno da ${NOME_TURNO[cell.turno]} em ${this.anoLetivo()}, e o motivo "${cell.motivoIndisponivel}" é apagado.`,
      confirmLabel: 'Tornar disponível',
    });
    if (ok) this.gravarMotivo(row.id, cell.turno, '', false);
  }

  private gravarMotivo(salaId: string, turno: Turno, motivo: string, peloDialogo: boolean): void {
    const sala = this.salasService.sala(salaId);
    if (!sala || this.gravandoMotivo()) return;
    this.gravandoMotivo.set(`${salaId}|${turno}`);
    this.salasService.definirIndisponibilidade(sala, turno, motivo).subscribe({
      next: (gravado) => {
        this.gravandoMotivo.set(null);
        if (peloDialogo) this.fecharMotivo();
        const titulo = `${sala.nome}, ${NOME_TURNO[turno]}`;
        if (gravado[turno]) this.toast.success(`${titulo}: indisponível`, `Em ${this.anoLetivo()}: ${gravado[turno]}`);
        else this.toast.success(`${titulo}: disponível de novo`, `Em ${this.anoLetivo()}.`);
      },
      error: (err) => {
        this.gravandoMotivo.set(null);
        this.toast.danger('Não foi possível gravar', motivoDaFalha(err));
      },
    });
  }
}
