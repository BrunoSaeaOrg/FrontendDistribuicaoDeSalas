import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SaeaButtonComponent,
  SaeaCheckboxComponent,
  SaeaDialogComponent,
  SaeaDialogFooterDirective,
} from '@sistemas-saea/saea-design-system';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { juntarFiliais, nomesDasUnidades } from '../../core/mock/ocupacao-adapter';
import { nomeDoAndar, unidadeNoFiltro } from '../../core/models';
import { ApiCopiaAnoPlanoDto, ApiCopiaSalaDto, ApiCopiaSalaResultadoDto, ApiSalaCriadaDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { motivoDaFalha, SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { MultiSelectComponent, MultiSelectOption } from '../../shared/ui/multi-select/multi-select.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';
import { NovaSalaComponent } from './nova-sala/nova-sala.component';

/** Salas por chamada de OC_SAL_COPIAR_ANO_SALAS: nenhuma chamada fica longa. */
export const SALAS_POR_LOTE = 10;

/** Uma sala da lista: os registros de carteiras dela no ano de origem. */
export interface LinhaSala {
  chave: string;
  codFilial: number;
  unidade: string;
  /** Por extenso ("Térreo", "1º andar"). */
  andar: string;
  nome: string;
  tipo: string;
  carteiras: number;
  capacidade: number;
  registros: ApiCopiaSalaDto[];
  /** Por que a sala não gravou na última cópia; ela continua marcada para copiar de novo. */
  erro?: string;
}

export interface GrupoFilial {
  codFilial: number;
  titulo: string;
  /** A unidade não recebeu a última cópia (sem período letivo no destino, ou mais de um): o motivo. */
  motivo?: string;
  linhas: LinhaSala[];
  selecionaveis: string[];
}

/** Como cada sala marcada ficou depois de Copiar. */
type ResultadoDaSala = 'copiada' | 'igual' | 'sem-periodo' | 'falhou';

/** "Sala 2" antes de "Sala 10", sem diferenciar maiúsculas nem acentos. */
const COMPARADOR = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Id do registro de carteiras: "CODCOLIGADA|CODFILIAL|IDPERLET|CODPREDIO|CODBLOCO|CODTIPOSALA|CODSALA". */
function chaveDoRegistro(s: ApiCopiaSalaDto): string {
  const [, filial, , predio, bloco, , codSala] = s.id.split('|');
  return filial !== undefined && codSala !== undefined ? `${filial}|${bloco}|${predio}|${codSala}` : `${s.codFilial}|${s.sala}`;
}

/**
 * Salas por ano: lista as salas de um ano letivo (OC_SAL_COPIAR_ANO_PLANO sem destino, que só lê o
 * RM), por unidade (filial do RM; o campo Unidade deixa só as marcadas na tela, sem reler o RM). A
 * pessoa marca as salas (ou todas) e Copiar abre um card que pergunta para qual ano; confirmado,
 * grava o registro de carteiras e capacidade das marcadas (OC_SAL_COPIAR_ANO_SALAS, em lotes). O
 * backend refaz o plano com o destino a cada lote: o que já está igual não é gravado de novo, e a
 * unidade sem período letivo no destino fica de fora, com o motivo. O que não gravou continua
 * marcado. As turmas não vão junto: as de cada ano entram nas salas pela tela Salas → Turmas.
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
    SaeaButtonComponent,
    SaeaCheckboxComponent,
    SaeaDialogComponent,
    SaeaDialogFooterDirective,
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

  /** O ano das salas listadas: começa no ano da tela. */
  readonly anoOrigem = linkedSignal(() => this.salasService.anoLetivo());

  readonly anoOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Selecione o ano' },
    ...this.salasService.anosLetivos().map((ano) => ({ value: ano, label: ano })),
  ]);

  /** O ano seguinte ao da lista, se o RM já tem: é o que o card de Copiar e a Nova sala sugerem. */
  readonly anoSeguinte = computed(() => {
    const seguinte = String(Number(this.anoOrigem()) + 1);
    return this.salasService.anosLetivos().includes(seguinte) ? seguinte : '';
  });

  readonly textoLendo = computed(() => `Lendo ${this.anoOrigem()} no RM...`);

  readonly plano = signal<ApiCopiaAnoPlanoDto | null>(null);
  readonly lendo = signal(false);
  readonly erroLeitura = signal<string | null>(null);
  readonly selecionadas = signal<ReadonlySet<string>>(new Set());
  /** Andamento da cópia; null quando não está copiando. */
  readonly progresso = signal<{ atual: number; total: number } | null>(null);
  readonly copiando = computed(() => this.progresso() !== null);
  /** O que não gravou na última cópia, por sala: o motivo aparece na linha. */
  private readonly falhas = signal<ReadonlyMap<string, string>>(new Map());
  /** As unidades que ficaram de fora da última cópia (por CODFILIAL): o motivo aparece no título delas. */
  private readonly motivosDasFiliais = signal<ReadonlyMap<number, string>>(new Map());
  /** Muda a cada leitura: um plano que chega depois de outra leitura é descartado. */
  private leitura = 0;

  constructor() {
    // Trocar o ano relê as salas (só leitura). A seleção e os avisos da última cópia eram do ano que estava na tela.
    effect(() => {
      const origem = this.anoOrigem();
      untracked(() => {
        this.selecionadas.set(new Set());
        this.limparResultado();
        void this.ler(origem);
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
    const falhas = this.falhas();
    const motivos = this.motivosDasFiliais();
    const somenteLeitura = this.uiMode.readOnlyMode();

    // As salas, pela chave do registro (filial, bloco, prédio e sala); a mesma sala pode ter mais de um registro.
    const porChave = new Map<string, ApiCopiaSalaDto[]>();
    plano.salas.forEach((s) => {
      const chave = chaveDoRegistro(s);
      porChave.set(chave, [...(porChave.get(chave) ?? []), s]);
    });

    const nomes = this.nomesDasFiliais();
    const linhas: LinhaSala[] = [...porChave.entries()].map(([chave, registros]) => {
      const registro = registros[0];
      return {
        chave,
        codFilial: registro.codFilial,
        // Cada filial é uma unidade: "CASJ 1", o mesmo nome do campo Unidade das outras telas.
        unidade: nomes.get(registro.codFilial) ?? `Unidade ${registro.codFilial}`,
        andar: nomeDoAndar(registro.andar),
        nome: registro.sala || 'Sala sem nome',
        tipo: registro.tipoSala,
        carteiras: registro.carteiras,
        capacidade: registro.capacidade,
        registros,
        erro: falhas.get(chave),
      };
    });

    // Por unidade (filial), na ordem do nome, como o campo Unidade das outras telas ("CASJ 1", "CASJ 2", "Liceu").
    const filiais = new Map<number, LinhaSala[]>();
    linhas.forEach((l) => filiais.set(l.codFilial, [...(filiais.get(l.codFilial) ?? []), l]));
    return [...filiais.entries()]
      .sort(([a, la], [b, lb]) => COMPARADOR.compare(la[0].unidade, lb[0].unidade) || a - b)
      .map(([codFilial, daFilial]) => {
        const ordenadas = [...daFilial].sort((a, b) => COMPARADOR.compare(a.nome, b.nome));
        return {
          codFilial,
          titulo: daFilial[0].unidade,
          motivo: motivos.get(codFilial),
          linhas: ordenadas,
          selecionaveis: somenteLeitura ? [] : ordenadas.map((l) => l.chave),
        };
      });
  });

  /**
   * As unidades da lista (o CODFILIAL de cada uma; nenhuma = todas). Só mudam quando a pessoa marca:
   * trocar o ano não mexe nelas, e se as marcadas não tiverem salas no ano, a lista fica vazia com o
   * aviso.
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

  /** O checkbox da unidade marca (ou desmarca) todas as salas dela. */
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
    void this.ler(this.anoOrigem());
  }

  // ------------------------------------------------------------- card de Copiar ---

  /** O card que pergunta para qual ano copiar (aberto pelo botão Copiar). */
  readonly dialogoCopiar = signal(false);
  /** O ano escolhido no card; fica para a próxima cópia, se ainda servir. */
  readonly anoDestino = signal('');

  /** Os anos do card: todos menos o das salas listadas. */
  readonly anoDestinoOptions = computed<SelectOption[]>(() =>
    this.anoOptions().filter((o) => o.value !== this.anoOrigem()),
  );

  readonly tituloCopiar = computed(() => `${this.textoBotao()} de ${this.anoOrigem()}`);
  readonly podeConfirmar = computed(() => !!this.anoDestino() && this.anoDestino() !== this.anoOrigem() && !this.copiando());

  /** Abre o card com o último ano escolhido ou, se ele não serve, com o ano seguinte ao da lista. */
  abrirCopia(): void {
    if (!this.podeCopiar()) return;
    const ultimo = this.anoDestino();
    const valido = ultimo && ultimo !== this.anoOrigem() && this.salasService.anosLetivos().includes(ultimo);
    this.anoDestino.set(valido ? ultimo : this.anoSeguinte());
    this.dialogoCopiar.set(true);
  }

  fecharCopia(): void {
    if (!this.copiando()) this.dialogoCopiar.set(false);
  }

  /** O diálogo Nova sala (escolher a unidade e preencher a sala). */
  readonly novaSalaAberta = signal(false);

  /**
   * A sala nova está no cadastro do RM e nos anos em que entrou: relê a lista (ela aparece se entrou
   * no ano listado) e, se o ano das outras telas é um deles, recarrega as salas delas.
   */
  aoCriarSala(criada: ApiSalaCriadaDto): void {
    void this.ler(this.anoOrigem());
    const entrou = criada.anos.filter((a) => a.situacao !== 'falhou').map((a) => a.ano);
    if (entrou.includes(this.salasService.anoLetivo())) this.salasService.carregar();
  }

  /**
   * Grava as salas marcadas no ano escolhido no card. Vão todos os registros delas: o backend refaz o
   * plano com o destino e só grava o que é novo ou mudou. O que não gravou (falha ou unidade sem
   * período no destino) continua marcado, com o motivo.
   */
  async copiar(): Promise<void> {
    if (!this.podeCopiar() || !this.podeConfirmar()) return;
    const origem = this.anoOrigem();
    const destino = this.anoDestino();
    const codUsuario = this.codUsuario();
    const marcadas = this.marcadas();

    const registros = marcadas.flatMap((l) => l.registros.map((r) => ({ linha: l.chave, id: r.id })));
    const total = registros.length;
    if (!total) return;

    const resultados = new Map<string, ApiCopiaSalaResultadoDto>();
    let feitas = 0;
    this.limparResultado();
    this.progresso.set({ atual: 0, total });
    try {
      for (let i = 0; i < registros.length; i += SALAS_POR_LOTE) {
        const lote = registros.slice(i, i + SALAS_POR_LOTE);
        try {
          const voltou = await firstValueFrom(this.api.copiarSalasDoAno(codUsuario, origem, destino, lote.map((r) => r.id)));
          voltou.forEach((r) => resultados.set(r.id, r));
        } catch (err) {
          // O lote inteiro caiu (ex.: sem conexão): os próximos seguem e estas ficam para copiar de novo.
          const erro = motivoDaFalha(err);
          lote.forEach((r) => resultados.set(r.id, { id: r.id, situacao: 'falhou', erro }));
        }
        feitas += lote.length;
        this.progresso.set({ atual: feitas, total });
      }
    } finally {
      this.progresso.set(null);
    }

    // Uma sala pode ter mais de um registro: vale o pior deles.
    const falhas = new Map<string, string>();
    const motivos = new Map<number, string>();
    const contagem: Record<ResultadoDaSala, number> = { copiada: 0, igual: 0, 'sem-periodo': 0, falhou: 0 };
    for (const linha of marcadas) {
      const daSala = linha.registros.map(
        (r) => resultados.get(r.id) ?? { id: r.id, situacao: 'falhou' as const, erro: 'O RM não confirmou a gravação.' },
      );
      const falhou = daSala.find((r) => r.situacao === 'falhou');
      const semPeriodo = daSala.find((r) => r.situacao === 'sem-periodo' || r.situacao === 'periodo-ambiguo');
      let resultado: ResultadoDaSala;
      if (falhou) {
        resultado = 'falhou';
        falhas.set(linha.chave, falhou.erro || 'O RM não confirmou a gravação.');
      } else if (semPeriodo) {
        resultado = 'sem-periodo';
        motivos.set(
          linha.codFilial,
          semPeriodo.situacao === 'periodo-ambiguo'
            ? `Não copiada: tem mais de um período letivo em ${destino}, não dá para saber em qual gravar.`
            : `Não copiada: ainda não tem período letivo em ${destino}.`,
        );
      } else if (daSala.some((r) => r.situacao === 'criada' || r.situacao === 'atualizada')) {
        resultado = 'copiada';
      } else {
        resultado = 'igual';
      }
      contagem[resultado]++;
    }

    this.falhas.set(falhas);
    this.motivosDasFiliais.set(motivos);
    // As que não gravaram continuam marcadas: é só clicar em Copiar de novo.
    this.selecionadas.set(
      new Set(marcadas.filter((l) => falhas.has(l.chave) || motivos.has(l.codFilial)).map((l) => l.chave)),
    );
    this.dialogoCopiar.set(false);
    this.avisar(contagem, destino);
    // A tela está no ano que acabou de receber a cópia: recarrega para mostrar.
    if (contagem.copiada && this.salasService.anoLetivo() === destino) this.salasService.carregar();
  }

  private avisar(c: Record<ResultadoDaSala, number>, destino: string): void {
    const partes = [
      c.copiada ? `${plural(c.copiada, 'sala copiada', 'salas copiadas')} para ${destino}` : '',
      c.igual ? `${plural(c.igual, 'já estava igual', 'já estavam iguais')}` : '',
      c['sem-periodo'] ? `${plural(c['sem-periodo'], 'ficou de fora', 'ficaram de fora')} (unidade sem período letivo)` : '',
      c.falhou ? `${plural(c.falhou, 'não foi gravada', 'não foram gravadas')}` : '',
    ].filter(Boolean);
    const texto = partes.join(', ') + '.';
    if (c.falhou || c['sem-periodo']) {
      this.toast.warning('Cópia concluída com pendências', `${texto} As que não gravaram continuam marcadas.`);
    } else if (c.copiada) {
      this.toast.success('Cópia concluída', texto);
    } else {
      this.toast.info('Nada a copiar', `As salas marcadas já estavam iguais em ${destino}.`);
    }
  }

  private limparResultado(): void {
    this.falhas.set(new Map());
    this.motivosDasFiliais.set(new Map());
  }

  /** Lê as salas do ano (só leitura); sem ano, a lista fica vazia. */
  private async ler(origem: string): Promise<void> {
    const leitura = ++this.leitura;
    this.erroLeitura.set(null);
    if (!origem) {
      this.plano.set(null);
      this.lendo.set(false);
      return;
    }
    this.lendo.set(true);
    try {
      const plano = await firstValueFrom(this.api.getPlanoCopiaAno(this.codUsuario(), origem, ''));
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
