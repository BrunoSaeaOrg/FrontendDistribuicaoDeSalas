import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaeaCheckboxComponent } from '@sistemas-saea/saea-design-system';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { juntarFiliais, nomesDasUnidades } from '../../core/mock/ocupacao-adapter';
import { nomeDoAndar, unidadeNoFiltro } from '../../core/models';
import { ApiCopiaAnoPlanoDto, ApiCopiaSalaDto, ApiSalaCriadaDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { motivoDaFalha, SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { BadgeTone } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { MultiSelectComponent, MultiSelectOption } from '../../shared/ui/multi-select/multi-select.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';
import { NovaSalaComponent } from './nova-sala/nova-sala.component';

/** Salas por chamada de OC_SAL_COPIAR_ANO_SALAS: nenhuma chamada fica longa. */
export const SALAS_POR_LOTE = 10;

/** O que a sala marcada grava no destino; "sem-destino" é a lista antes de escolher o "Para" (nada a copiar ainda). */
export type EstadoSala = 'nova' | 'muda' | 'igual' | 'falhou' | 'sem-destino';

/** O que a cópia faz com a sala, na dica da linha (a tabela só tem as colunas da sala). */
const SELO: Record<EstadoSala, { tom: BadgeTone; texto: (destino: string) => string }> = {
  nova: { tom: 'info', texto: (d) => `Nova em ${d}` },
  muda: { tom: 'warning', texto: () => 'Carteiras diferentes' },
  igual: { tom: 'success', texto: () => 'Igual' },
  falhou: { tom: 'danger', texto: () => 'Não gravou' },
  'sem-destino': { tom: 'info', texto: () => 'Escolha o ano de destino para copiar' },
};

/** Uma sala da lista: os registros de carteiras dela. */
export interface LinhaSala {
  chave: string;
  codFilial: number;
  unidade: string;
  /** Por extenso ("Térreo", "1º andar"). */
  andar: string;
  nome: string;
  tipo: string;
  /** "25 → 30" quando o destino tem outro valor e a cópia vai mudar. */
  carteiras: string;
  capacidade: string;
  registros: ApiCopiaSalaDto[];
  /** Quantos registros da sala a cópia grava (os que vão ser criados ou mudar). */
  aGravar: number;
  estado: EstadoSala;
  selo: { tom: BadgeTone; texto: string };
  erro?: string;
}

export interface GrupoFilial {
  codFilial: number;
  titulo: string;
  /** A filial não tem como receber a cópia (sem período no destino): só o motivo, sem as salas. */
  motivo?: string;
  linhas: LinhaSala[];
  selecionaveis: string[];
}

/** "Sala 2" antes de "Sala 10", sem diferenciar maiúsculas nem acentos. */
const COMPARADOR = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * O número da sala na coluna: o da origem, ou "destino → origem" quando o registro do destino tem
 * outro valor e a cópia vai trocar (só no "atualizar", que é quando `origem` e `noDestino` vêm).
 */
function deParaDestino(valor: number, origem?: number, noDestino?: number | null): string {
  return origem !== undefined && noDestino != null && noDestino !== origem ? `${noDestino} → ${origem}` : String(valor);
}

/** Id do registro de carteiras: "CODCOLIGADA|CODFILIAL|IDPERLET|CODPREDIO|CODBLOCO|CODTIPOSALA|CODSALA". */
function chaveDoRegistro(s: ApiCopiaSalaDto): string {
  const [, filial, , predio, bloco, , codSala] = s.id.split('|');
  return filial !== undefined && codSala !== undefined ? `${filial}|${bloco}|${predio}|${codSala}` : `${s.codFilial}|${s.sala}`;
}

/**
 * Salas por ano: copia salas de um ano letivo para outro (ex.: 2026 → 2027), uma tela só. Ao
 * escolher o ano de origem, a tela lê o plano (OC_SAL_COPIAR_ANO_PLANO, que só lê o RM) e lista as
 * salas dele (só as dele: a sala que só o destino tem não entra); sem o ano de destino, a lista vem
 * sem nada para marcar. As salas ficam por unidade, que é uma filial do RM (o campo Unidade deixa
 * só as marcadas na tela, sem reler o RM); com os dois anos, a pessoa marca as salas (ou
 * todas) e Copiar grava só as marcadas que estão na tela: o registro de
 * carteiras e capacidade da sala (OC_SAL_COPIAR_ANO_SALAS, em lotes). Depois relê o plano: o que
 * gravou vira "Igual" e o que falhou fica marcado para copiar de novo. As turmas não vão junto: as
 * de cada ano entram nas salas pela tela Salas → Turmas. A unidade entra assim que tem período letivo
 * no destino, com ou sem turma.
 */
@Component({
  selector: 'app-copiar-ano',
  standalone: true,
  imports: [
    FormsModule,
    ButtonComponent,
    CardComponent,
    CarregandoComponent,
    EmptyStateComponent,
    MultiSelectComponent,
    NovaSalaComponent,
    SelectComponent,
    SaeaCheckboxComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './copiar-ano.component.html',
  styleUrl: './copiar-ano.component.css',
})
export class CopiarAnoComponent {
  private readonly api = inject(OcupacaoApiService);
  private readonly auth = inject(AuthService);
  private readonly salasService = inject(SalasService);
  private readonly toast = inject(ToastService);
  readonly uiMode = inject(UiModeService);

  /** Começa no ano da tela; o destino, no ano seguinte, se ele existir no RM. */
  readonly anoOrigem = linkedSignal(() => this.salasService.anoLetivo());
  readonly anoDestino = linkedSignal(() => {
    const seguinte = String(Number(this.anoOrigem()) + 1);
    return this.salasService.anosLetivos().includes(seguinte) ? seguinte : '';
  });

  readonly anoOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Selecione o ano' },
    ...this.salasService.anosLetivos().map((ano) => ({ value: ano, label: ano })),
  ]);

  /** O "Para" ainda vazio: a lista é só das salas da origem, sem nada para marcar. */
  readonly semDestino = computed(() => !this.anoDestino());

  readonly textoLendo = computed(() =>
    this.semDestino() ? `Lendo ${this.anoOrigem()} no RM...` : `Lendo ${this.anoOrigem()} e ${this.anoDestino()} no RM...`,
  );

  readonly plano = signal<ApiCopiaAnoPlanoDto | null>(null);
  readonly lendo = signal(false);
  readonly erroLeitura = signal<string | null>(null);
  readonly selecionadas = signal<ReadonlySet<string>>(new Set());
  /** Andamento da cópia; null quando não está copiando. */
  readonly progresso = signal<{ atual: number; total: number } | null>(null);
  readonly copiando = computed(() => this.progresso() !== null);
  /** O que não gravou na última cópia, por sala: o motivo aparece na linha. */
  private readonly falhas = signal<ReadonlyMap<string, string>>(new Map());
  /** Muda a cada leitura: um plano que chega depois de outra leitura é descartado. */
  private leitura = 0;

  constructor() {
    // Trocar os anos relê as salas (só leitura); basta o de origem para listar. A seleção é dos anos que estavam na tela.
    effect(() => {
      const origem = this.anoOrigem();
      const destino = this.anoDestino();
      untracked(() => {
        this.selecionadas.set(new Set());
        this.falhas.set(new Map());
        void this.ler(origem, destino);
      });
    });
  }

  /**
   * "CASJ 1": a mesma numeração das outras telas. As filiais que as telas já viram valem mais que as
   * do plano (o nome do RM pode vir escrito diferente); as que só o plano tem entram também.
   */
  private readonly nomesDasFiliais = computed(() =>
    nomesDasUnidades(juntarFiliais(this.filiaisDosPlanos(), this.salasService.filiais())),
  );

  /** As filiais de todos os planos lidos: o número não muda ao trocar para anos com menos filiais. */
  private readonly filiaisDosPlanos = linkedSignal<ApiCopiaAnoPlanoDto | null, ReadonlyMap<number, string>>({
    source: this.plano,
    computation: (plano, anterior) => {
      const filiais = new Map(anterior?.value ?? []);
      plano?.salas.forEach((s) => {
        if (!filiais.get(s.codFilial)) filiais.set(s.codFilial, s.unidade?.trim() ?? '');
      });
      return filiais;
    },
  });

  /** Todas as unidades (filiais) do plano; a tela mostra só as marcadas em `unidades`. */
  private readonly todosOsGrupos = computed<GrupoFilial[]>(() => {
    const plano = this.plano();
    if (!plano) return [];
    const destino = this.anoDestino();
    const falhas = this.falhas();
    const somenteLeitura = this.uiMode.readOnlyMode();

    // As salas, pela chave do registro (filial, bloco, prédio e sala); a mesma sala pode ter mais de um registro.
    const porChave = new Map<string, ApiCopiaSalaDto[]>();
    plano.salas.forEach((s) => {
      const chave = chaveDoRegistro(s);
      porChave.set(chave, [...(porChave.get(chave) ?? []), s]);
    });

    const nomes = this.nomesDasFiliais();
    const linhas = [...porChave.entries()].map(([chave, registros]) => {
      const registro = registros[0];
      // Cada filial é uma unidade: "CASJ 1", o mesmo nome do campo Unidade das outras telas.
      const unidade = nomes.get(registro.codFilial) ?? `Unidade ${registro.codFilial}`;
      const aGravar = registros.filter((r) => r.situacao === 'copiar' || r.situacao === 'atualizar').length;
      const erro = falhas.get(chave);
      const estado: EstadoSala = erro
        ? 'falhou'
        : registros.some((r) => r.situacao === 'copiar')
          ? 'nova'
          : registros.some((r) => r.situacao === 'atualizar')
            ? 'muda'
            : registros.every((r) => r.situacao === 'sem-destino')
              ? 'sem-destino'
              : 'igual';
      const muda = registros.find((r) => r.situacao === 'atualizar');
      return {
        chave,
        codFilial: registro.codFilial,
        unidade,
        andar: nomeDoAndar(registro.andar),
        nome: registro.sala || 'Sala sem nome',
        tipo: registro.tipoSala,
        carteiras: deParaDestino(registro.carteiras, muda?.carteiras, muda?.carteirasNoDestino),
        capacidade: deParaDestino(registro.capacidade, muda?.capacidade, muda?.capacidadeNoDestino),
        registros,
        aGravar,
        estado,
        selo: { tom: SELO[estado].tom, texto: SELO[estado].texto(destino) },
        erro,
        situacoes: registros.map((r) => r.situacao),
      };
    });

    // Por unidade (filial); a que não tem período no destino vira só o motivo.
    const filiais = new Map<number, typeof linhas>();
    linhas.forEach((l) => filiais.set(l.codFilial, [...(filiais.get(l.codFilial) ?? []), l]));
    // Na ordem do nome, como o campo Unidade das outras telas ("CASJ 1", "CASJ 2", "Liceu").
    return [...filiais.entries()]
      .sort(([a, la], [b, lb]) => COMPARADOR.compare(la[0].unidade, lb[0].unidade) || a - b)
      .map(([codFilial, daFilial]) => {
        const titulo = daFilial[0].unidade;
        const semPeriodo = daFilial.every((l) => l.situacoes.every((s) => s === 'sem-periodo'));
        const ambiguo = daFilial.every((l) => l.situacoes.every((s) => s === 'periodo-ambiguo'));
        if (semPeriodo || ambiguo) {
          const motivo = ambiguo
            ? `Tem mais de um período letivo em ${destino}: não dá para saber em qual gravar.`
            : `Ainda não tem período letivo em ${destino}. Depois de criar, as salas aparecem aqui.`;
          return { codFilial, titulo, motivo, linhas: [], selecionaveis: [] };
        }
        const ordenadas: LinhaSala[] = daFilial
          .map(({ situacoes: _, ...l }) => l)
          .sort((a, b) => COMPARADOR.compare(a.nome, b.nome));
        return {
          codFilial,
          titulo,
          linhas: ordenadas,
          selecionaveis: somenteLeitura ? [] : ordenadas.filter((l) => l.aGravar > 0).map((l) => l.chave),
        };
      });
  });

  /**
   * As unidades da cópia (o CODFILIAL de cada uma; nenhuma = todas). Só mudam quando a pessoa marca:
   * trocar os anos não mexe nelas, e se as marcadas não tiverem salas no ano de origem, a lista fica
   * vazia com o aviso.
   */
  readonly unidades = signal<string[]>([]);

  /** O nome de cada unidade já vista num plano: a marcada continua com nome num ano em que não aparece. */
  private readonly nomesDasUnidades = linkedSignal<GrupoFilial[], ReadonlyMap<string, string>>({
    source: this.todosOsGrupos,
    computation: (grupos, anterior) =>
      new Map([...(anterior?.value ?? []), ...grupos.map((g) => [String(g.codFilial), g.titulo] as const)]),
  });

  /** As unidades do plano e as marcadas que não estão nele, para o campo nunca perder o que foi marcado. */
  readonly unidadeOptions = computed<MultiSelectOption[]>(() => {
    const nomes = this.nomesDasUnidades();
    const codigos = new Set(this.todosOsGrupos().map((g) => String(g.codFilial)));
    this.unidades().forEach((u) => codigos.add(u));
    return [...codigos]
      .map((c) => ({ value: c, label: nomes.get(c) ?? this.salasService.nomeDaFilial(c) }))
      .sort((a, b) => COMPARADOR.compare(a.label, b.label));
  });

  /** Para os avisos: "da CASJ 1" com uma unidade marcada, "das unidades marcadas" com várias, '' sem nenhuma. */
  readonly daUnidade = computed(() => {
    const unidades = this.unidades();
    if (unidades.length === 0) return '';
    if (unidades.length > 1) return 'das unidades marcadas';
    return `da ${this.nomesDasUnidades().get(unidades[0]) ?? this.salasService.nomeDaFilial(unidades[0])}`;
  });

  readonly grupos = computed<GrupoFilial[]>(() => {
    const unidades = this.unidades();
    return this.todosOsGrupos().filter((g) => unidadeNoFiltro(unidades, String(g.codFilial)));
  });

  private readonly linhas = computed(() => this.grupos().flatMap((g) => g.linhas));
  readonly selecionaveis = computed(() => this.grupos().flatMap((g) => g.selecionaveis));
  readonly marcadas = computed(() => this.linhas().filter((l) => this.selecionadas().has(l.chave)));
  readonly algumaMarcada = computed(() => this.marcadas().length > 0);
  readonly temSalas = computed(() => this.linhas().length > 0);
  readonly tudoIgual = computed(
    () => this.temSalas() && !this.semDestino() && this.selecionaveis().length === 0 && !this.uiMode.readOnlyMode(),
  );
  readonly textoTudoIgual = computed(() => {
    const salas = this.daUnidade() ? `as salas ${this.daUnidade()}` : 'as salas';
    return `Todas ${salas} em ${this.anoDestino()} já estão iguais às de ${this.anoOrigem()}.`;
  });

  readonly textoBotao = computed(() => {
    const n = this.marcadas().length;
    return n ? `Copiar ${plural(n, 'sala', 'salas')}` : 'Copiar';
  });
  readonly textoProgresso = computed(() => {
    const p = this.progresso();
    return p ? `Copiando ${p.atual} de ${p.total}...` : '';
  });
  readonly podeCopiar = computed(() => this.algumaMarcada() && !this.copiando() && !this.lendo() && !this.uiMode.readOnlyMode());

  escolherOrigem(ano: string): void {
    if (!this.copiando()) this.anoOrigem.set(ano);
  }

  escolherDestino(ano: string): void {
    if (!this.copiando()) this.anoDestino.set(ano);
  }

  /** Só filtra a lista (o plano já tem todas as unidades). As salas marcadas saem: o Copiar é das unidades na tela. */
  escolherUnidades(unidades: string[]): void {
    if (this.copiando()) return;
    this.unidades.set(unidades);
    this.selecionadas.set(new Set());
  }

  marcar(chave: string, marcada: boolean): void {
    this.selecionadas.update((atual) => {
      const proximas = new Set(atual);
      if (marcada) proximas.add(chave);
      else proximas.delete(chave);
      return proximas;
    });
  }

  /** O checkbox da unidade marca (ou desmarca) as salas dela que têm algo a copiar. */
  marcarFilial(grupo: GrupoFilial, marcadas: boolean): void {
    this.selecionadas.update((atual) => {
      const proximas = new Set(atual);
      grupo.selecionaveis.forEach((c) => (marcadas ? proximas.add(c) : proximas.delete(c)));
      return proximas;
    });
  }

  filialMarcada(grupo: GrupoFilial): boolean {
    return grupo.selecionaveis.length > 0 && grupo.selecionaveis.every((c) => this.selecionadas().has(c));
  }

  filialEmParte(grupo: GrupoFilial): boolean {
    return !this.filialMarcada(grupo) && grupo.selecionaveis.some((c) => this.selecionadas().has(c));
  }

  tentarDeNovo(): void {
    void this.ler(this.anoOrigem(), this.anoDestino());
  }

  /** O diálogo Nova sala (escolher a unidade e preencher a sala). */
  readonly novaSalaAberta = signal(false);

  /**
   * A sala nova está no cadastro do RM e nos anos em que entrou: relê a lista (ela aparece se entrou
   * no ano de origem) e, se o ano das outras telas é um deles, recarrega as salas delas.
   */
  aoCriarSala(criada: ApiSalaCriadaDto): void {
    void this.ler(this.anoOrigem(), this.anoDestino());
    const entrou = criada.anos.filter((a) => a.situacao !== 'falhou').map((a) => a.ano);
    if (entrou.includes(this.salasService.anoLetivo())) this.salasService.carregar();
  }

  /** Grava as salas marcadas; o que falhar fica marcado para copiar de novo. */
  async copiar(): Promise<void> {
    if (!this.podeCopiar()) return;
    const origem = this.anoOrigem();
    const destino = this.anoDestino();
    const codUsuario = this.codUsuario();
    const marcadas = this.marcadas();

    const registros = marcadas.flatMap((l) =>
      l.registros.filter((r) => r.situacao === 'copiar' || r.situacao === 'atualizar').map((r) => ({ linha: l.chave, registro: r })),
    );
    const total = registros.length;
    if (!total) return;

    const falhas = new Map<string, string>();
    let feitas = 0;
    this.progresso.set({ atual: 0, total });
    try {
      for (let i = 0; i < registros.length; i += SALAS_POR_LOTE) {
        const lote = registros.slice(i, i + SALAS_POR_LOTE);
        const linhaDoId = new Map(lote.map((r) => [r.registro.id, r.linha]));
        try {
          const resultados = await firstValueFrom(this.api.copiarSalasDoAno(codUsuario, origem, destino, [...linhaDoId.keys()]));
          resultados
            .filter((r) => r.situacao === 'falhou')
            .forEach((r) => falhas.set(linhaDoId.get(r.id) ?? r.id, r.erro || 'O RM não confirmou a gravação.'));
        } catch (err) {
          // O lote inteiro caiu (ex.: sem conexão): os próximos seguem e estas ficam para copiar de novo.
          const erro = motivoDaFalha(err);
          lote.forEach((r) => falhas.set(r.linha, erro));
        }
        feitas += lote.length;
        this.progresso.set({ atual: feitas, total });
      }
    } finally {
      this.progresso.set(null);
    }

    this.falhas.set(falhas);
    // As que falharam continuam marcadas: é só clicar em Copiar de novo.
    this.selecionadas.set(new Set(falhas.keys()));
    this.avisar(marcadas.length, falhas.size, destino);
    await this.ler(origem, destino);
    // A tela está no ano que acabou de receber a cópia: recarrega para mostrar.
    if (this.salasService.anoLetivo() === destino) this.salasService.carregar();
  }

  private avisar(salas: number, falhas: number, destino: string): void {
    if (falhas) {
      this.toast.warning(
        'Cópia concluída com falhas',
        `${plural(falhas, 'sala não foi gravada', 'salas não foram gravadas')}. Elas continuam marcadas para copiar de novo.`,
      );
      return;
    }
    this.toast.success('Cópia concluída', `${plural(salas, 'sala copiada', 'salas copiadas')} para ${destino}.`);
  }

  /**
   * Lê o plano (só leitura). Sem destino, vêm só as salas da origem; sem origem ou com o mesmo ano
   * nos dois, a lista fica vazia.
   */
  private async ler(origem: string, destino: string): Promise<void> {
    const leitura = ++this.leitura;
    this.erroLeitura.set(null);
    if (!origem || origem === destino) {
      this.plano.set(null);
      this.lendo.set(false);
      return;
    }
    this.lendo.set(true);
    try {
      const plano = await firstValueFrom(this.api.getPlanoCopiaAno(this.codUsuario(), origem, destino));
      if (leitura !== this.leitura) return;
      this.plano.set(plano);
    } catch (err) {
      if (leitura !== this.leitura) return;
      this.plano.set(null);
      this.erroLeitura.set(motivoDaFalha(err));
    } finally {
      if (leitura === this.leitura) this.lendo.set(false);
    }
  }

  private codUsuario(): string {
    return this.auth.currentUser()?.username ?? '';
  }
}
