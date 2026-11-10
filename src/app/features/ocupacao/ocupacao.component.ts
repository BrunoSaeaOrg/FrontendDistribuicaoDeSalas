import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Turno } from '../../core/models';
import { OcupacaoAnosService } from '../../core/services/ocupacao-anos.service';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { MultiSelectComponent, MultiSelectOption } from '../../shared/ui/multi-select/multi-select.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';
import {
  Agrupador,
  agruparEntradas,
  entradasDasSalas,
  FAIXAS,
  FaixaOcupacao,
  fimDaEscala,
  FiltrosOcupacao,
  formatarNumero,
  formatarPct,
  formatarVariacao,
  GrupoOcupacao,
  resumir,
  ResumoOcupacao,
} from './ocupacao-calculo';

type OcupVis = 'tabela' | 'grafico' | 'anos';
type Coluna = 'label' | 'alunos' | 'capacidade' | 'limite' | 'vagas' | 'ocupacao';

/** Tooltip do gráfico: o grupo e onde ele aparece, relativo à área do gráfico. */
interface Dica {
  grupo: GrupoOcupacao;
  x: number;
  y: number;
}

/** Uma coluna (ano) da aba Comparar anos. */
interface ColunaAno {
  ano: string;
  estado: 'carregando' | 'pronto' | 'erro';
  grupos: ReadonlyMap<string, GrupoOcupacao>;
  resumo: ResumoOcupacao | null;
}

/** Tamanho do tooltip do gráfico (ver .ocup-dica no CSS), para ele não sair da área. */
const LARGURA_DICA = 248;
const ALTURA_DICA = 176;

@Component({
  selector: 'app-ocupacao',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, CardComponent, CarregandoComponent, EmptyStateComponent, MultiSelectComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ocupacao.component.html',
  styleUrl: './ocupacao.component.css',
})
export class OcupacaoComponent {
  private readonly salasService = inject(SalasService);
  private readonly regrasService = inject(RegrasService);
  private readonly anosService = inject(OcupacaoAnosService);

  readonly faixas = FAIXAS;
  readonly listaFaixas: FaixaOcupacao[] = ['disponivel', 'quase', 'excedida'];
  readonly num = formatarNumero;
  readonly pct = formatarPct;

  /** Ano letivo dos dados: os anos vêm do RM, e trocar recarrega as turmas daquele ano. */
  readonly ano = this.salasService.anoLetivo;
  /** O ano escolhido ainda está vindo do RM: spinner no campo do ano e véu sobre o conteúdo. */
  readonly carregando = this.salasService.loading;
  readonly trocandoAno = this.salasService.trocandoAno;
  /** Unidades marcadas (cada uma é uma filial do RM, ex.: "CASJ 1"); nenhuma marcada = todas. */
  readonly unidades = signal<string[]>([]);
  readonly turno = signal<'todas' | Turno>('todas');
  readonly segmento = signal('todas');
  readonly agrupar = signal<Agrupador>('unidade');
  readonly vis = signal<OcupVis>('tabela');
  /** Ordem da tabela e do gráfico: por padrão, os mais cheios primeiro. */
  readonly ordem = signal<{ coluna: Coluna; desc: boolean }>({ coluna: 'ocupacao', desc: true });
  /** Anos marcados em Comparar anos; null = o ano em uso e os dois anteriores. */
  readonly anosMarcados = signal<string[] | null>(null);
  readonly dica = signal<Dica | null>(null);

  private readonly areaGrafico = viewChild<ElementRef<HTMLElement>>('areaGrafico');

  readonly anoOptions = computed<SelectOption[]>(() =>
    this.salasService.anosLetivos().map((ano) => ({ value: ano, label: ano })),
  );

  selecionarAno(ano: string): void {
    this.salasService.selecionarAno(ano);
  }

  readonly unidadeOptions = computed<MultiSelectOption[]>(() =>
    this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  );

  selecionarUnidades(unidades: string[]): void {
    this.unidades.set(unidades);
  }

  readonly turnoOptions: SelectOption[] = [
    { value: 'todas', label: 'Todos os turnos' },
    { value: 'manha', label: 'Manhã' },
    { value: 'tarde', label: 'Tarde' },
  ];
  readonly segmentoOptions = computed<SelectOption[]>(() => [
    { value: 'todas', label: 'Todos os segmentos' },
    ...this.salasService.segmentos().map((s) => ({ value: s, label: s })),
  ]);
  readonly agruparOptions: { value: Agrupador; label: string }[] = [
    { value: 'unidade', label: 'Unidade' },
    { value: 'turno', label: 'Turno' },
    { value: 'segmento', label: 'Segmento' },
    { value: 'serie', label: 'Série' },
    { value: 'turma', label: 'Turma' },
  ];
  readonly visTabs: { value: OcupVis; label: string; icone: string }[] = [
    { value: 'tabela', label: 'Tabela', icone: 'table_rows' },
    { value: 'grafico', label: 'Gráfico', icone: 'bar_chart' },
    { value: 'anos', label: 'Comparar anos', icone: 'compare_arrows' },
  ];

  readonly agruparLabel = computed(
    () => this.agruparOptions.find((o) => o.value === this.agrupar())?.label ?? '',
  );

  private readonly filtros = computed<FiltrosOcupacao>(() => ({
    unidades: this.unidades(),
    turno: this.turno(),
    segmento: this.segmento(),
    agrupar: this.agrupar(),
  }));

  /** % máximo de utilização da regra da unidade (90% enquanto a regra não chega do RM). */
  private readonly pctDaFilial = (codFilial: number): number =>
    this.regrasService.regrasDaFilial(codFilial).pctMaximoUtilizacao ?? 90;

  private readonly entradas = computed(() => entradasDasSalas(this.salasService.salas(), this.pctDaFilial));

  readonly grupos = computed<GrupoOcupacao[]>(() => {
    const nome = (id: string) => this.salasService.unidade(id)?.nome ?? this.salasService.nomeDaFilial(id);
    const grupos = agruparEntradas(this.entradas(), this.filtros(), nome);
    const { coluna, desc } = this.ordem();
    const valor = (g: GrupoOcupacao): number =>
      coluna === 'vagas' ? g.capacidade - g.alunos : coluna === 'label' ? 0 : g[coluna];
    return grupos.sort((a, b) => {
      const r =
        coluna === 'label'
          ? a.label.localeCompare(b.label, 'pt-BR', { numeric: true })
          : valor(a) - valor(b) || a.label.localeCompare(b.label, 'pt-BR', { numeric: true });
      return desc ? -r : r;
    });
  });

  readonly resumo = computed(() => resumir(this.grupos()));
  readonly hasData = computed(() => this.grupos().length > 0);

  ordenarPor(coluna: Coluna): void {
    this.ordem.update((o) =>
      o.coluna === coluna ? { coluna, desc: !o.desc } : { coluna, desc: coluna !== 'label' },
    );
  }

  ariaSort(coluna: Coluna): 'ascending' | 'descending' | null {
    const o = this.ordem();
    return o.coluna === coluna ? (o.desc ? 'descending' : 'ascending') : null;
  }

  /** O limite da regra em lugares, para baixo (como na Planta: 30 com 90% → 27). */
  limiteEmLugares(g: { limite: number }): number {
    return Math.floor(g.limite + 1e-9);
  }

  vagas(g: { capacidade: number; alunos: number }): number {
    return Math.round(g.capacidade) - g.alunos;
  }

  /** Vagas com sinal de menos quando passou da capacidade: "−12". */
  textoVagas(g: { capacidade: number; alunos: number }): string {
    const v = this.vagas(g);
    return v < 0 ? `−${formatarNumero(-v)}` : formatarNumero(v);
  }

  descricao(g: GrupoOcupacao): string {
    return `${g.label}: ${formatarPct(g.ocupacao)} de ocupação, ${formatarNumero(g.alunos)} alunos em ${formatarNumero(g.capacidade)} lugares, ${FAIXAS[g.faixa].rotulo}`;
  }

  // --- Gráfico ---

  /** Fim da escala: 100%, ou o próximo múltiplo de 25% acima do grupo mais cheio. */
  readonly escala = computed(() => fimDaEscala(Math.max(0, ...this.grupos().map((g) => g.ocupacao))));

  readonly marcas = computed(() => {
    const fim = this.escala();
    const passo = fim > 1.5 ? 0.5 : 0.25;
    const lista: number[] = [];
    for (let v = 0; v <= fim + 1e-9; v += passo) lista.push(Math.round(v * 100) / 100);
    return lista;
  });

  /** Posição de um valor (1 = 100%) na largura do gráfico, em %. */
  posicao(valor: number): number {
    return (valor / this.escala()) * 100;
  }

  mostrarDica(event: PointerEvent, grupo: GrupoOcupacao): void {
    const area = this.areaGrafico()?.nativeElement;
    if (!area) return;
    const r = area.getBoundingClientRect();
    this.dica.set({ grupo, ...this.posicaoDica(area, event.clientX - r.left, event.clientY - r.top) });
  }

  mostrarDicaNoFoco(event: FocusEvent, grupo: GrupoOcupacao): void {
    const area = this.areaGrafico()?.nativeElement;
    const linha = event.target as HTMLElement;
    if (!area) return;
    const r = area.getBoundingClientRect();
    const l = linha.getBoundingClientRect();
    this.dica.set({ grupo, ...this.posicaoDica(area, l.left - r.left + l.width * 0.6, l.top - r.top + l.height / 2) });
  }

  esconderDica(): void {
    this.dica.set(null);
  }

  /**
   * Ao lado do ponteiro (x e y relativos à parte visível da área). Perto da borda direita, vira
   * para a esquerda; perto do fim da parte visível, sobe. A área rola: soma o scrollTop.
   */
  private posicaoDica(area: HTMLElement, x: number, y: number): { x: number; y: number } {
    const direita = x + 16 + LARGURA_DICA <= area.clientWidth;
    const embaixo = y + 12 + ALTURA_DICA <= area.clientHeight;
    return {
      x: direita ? x + 16 : Math.max(0, x - 16 - LARGURA_DICA),
      y: area.scrollTop + (embaixo ? y + 12 : Math.max(0, y - 12 - ALTURA_DICA)),
    };
  }

  // --- Comparar anos ---

  readonly anosDisponiveis = computed(() =>
    [...new Set(this.salasService.anosLetivos())].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
  );

  readonly anosOptions = computed<MultiSelectOption[]>(() => this.anosDisponiveis().map((a) => ({ value: a, label: a })));

  /** Os anos comparados, em ordem: os marcados, ou o ano em uso e os dois anteriores. */
  readonly anosComparados = computed(() => {
    const todos = this.anosDisponiveis();
    const marcados = this.anosMarcados();
    if (marcados) return todos.filter((a) => marcados.includes(a));
    const i = todos.indexOf(this.ano());
    const ate = i >= 0 ? i : todos.length - 1;
    return todos.slice(Math.max(0, ate - 2), ate + 1);
  });

  selecionarAnosComparados(anos: string[]): void {
    this.anosMarcados.set(anos);
  }

  readonly comparacao = computed(() => {
    const filtros = this.filtros();
    const nomes = this.anosService.nomesDasUnidades();
    const nome = (id: string) => nomes.get(Number(id)) ?? `Unidade ${id}`;

    const colunas: ColunaAno[] = this.anosComparados().map((ano) => {
      const e = this.anosService.estado(ano);
      if (e?.estado !== 'pronto') return { ano, estado: e?.estado ?? 'carregando', grupos: new Map(), resumo: null };
      const grupos = agruparEntradas(entradasDasSalas(e.salas, this.pctDaFilial), filtros, nome);
      return { ano, estado: 'pronto', grupos: new Map(grupos.map((g) => [g.key, g])), resumo: resumir(grupos) };
    });

    // A variação é entre os dois anos mais recentes que têm turmas. Só depois de todos chegarem:
    // com um ano ainda no caminho, a conta pularia ele.
    const carregando = colunas.some((c) => c.estado === 'carregando');
    const comDados = carregando ? [] : colunas.filter((c) => (c.resumo?.grupos ?? 0) > 0);
    const de = comDados.at(-2) ?? null;
    const para = comDados.at(-1) ?? null;

    const rotulos = new Map<string, string>();
    colunas.forEach((c) => c.grupos.forEach((g) => rotulos.set(g.key, g.label)));
    const linhas = [...rotulos]
      .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }))
      .map(([key, label]) => {
        const g0 = de?.grupos.get(key);
        const g1 = para?.grupos.get(key);
        return {
          key,
          label,
          celulas: colunas.map((c) => c.grupos.get(key) ?? null),
          variacao: g0 && g1 ? this.variacao(g0.ocupacao, g1.ocupacao) : null,
        };
      });

    const total =
      de?.resumo && para?.resumo ? this.variacao(de.resumo.ocupacao, para.resumo.ocupacao) : null;
    return { colunas, linhas, de: de?.ano ?? null, para: para?.ano ?? null, total, carregando };
  });

  /**
   * Variação do cartão do ano sobre o ano anterior com turmas (que pode não ser o imediatamente
   * anterior, por isso o ano vai junto). Nada enquanto algum ano ainda está vindo do RM.
   */
  variacaoDoAno(i: number): { texto: string; icone: string; sobre: string } | null {
    const { colunas, carregando } = this.comparacao();
    const atual = colunas[i]?.resumo;
    if (carregando || !atual || atual.grupos === 0) return null;
    for (let j = i - 1; j >= 0; j--) {
      const antes = colunas[j].resumo;
      if (antes && antes.grupos > 0) return { ...this.variacao(antes.ocupacao, atual.ocupacao), sobre: colunas[j].ano };
    }
    return null;
  }

  private variacao(de: number, para: number): { texto: string; icone: string } {
    const pp = Math.round((para - de) * 100);
    return { texto: formatarVariacao(de, para), icone: pp > 0 ? 'trending_up' : pp < 0 ? 'trending_down' : 'trending_flat' };
  }

  tentarDeNovo(ano: string): void {
    this.anosService.recarregar(ano);
  }

  constructor() {
    // Comparar anos lê do RM os anos que faltam (um de cada vez) só quando a aba está aberta.
    effect(() => {
      if (this.vis() !== 'anos') return;
      const anos = this.anosComparados();
      // Ao trocar o ano em uso, o que deixou de ser o ano carregado precisa vir do RM.
      this.salasService.anoCarregado();
      untracked(() => this.anosService.garantir(anos));
    });
  }

  onVisChange(v: OcupVis): void {
    this.dica.set(null);
    this.vis.set(v);
  }
}
