import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaeaCheckboxComponent } from '@sistemas-saea/saea-design-system';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { nomeDoAndar } from '../../core/models';
import { ApiCopiaAnoPlanoDto, ApiCopiaSalaDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { motivoDaFalha, SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { BadgeTone } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

/** Salas por chamada de OC_SAL_COPIAR_ANO_SALAS: nenhuma chamada fica longa. */
export const SALAS_POR_LOTE = 10;

/** O que a sala marcada grava no destino. */
export type EstadoSala = 'nova' | 'muda' | 'igual' | 'falhou';

/** O que a cópia faz com a sala, na dica da linha (a tabela só tem as colunas da sala). */
const SELO: Record<EstadoSala, { tom: BadgeTone; texto: (destino: string) => string }> = {
  nova: { tom: 'info', texto: (d) => `Nova em ${d}` },
  muda: { tom: 'warning', texto: () => 'Carteiras diferentes' },
  igual: { tom: 'success', texto: () => 'Igual' },
  falhou: { tom: 'danger', texto: () => 'Não gravou' },
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
 * escolher os anos, a tela lê o plano (OC_SAL_COPIAR_ANO_PLANO, que só lê o RM) e lista as salas
 * de cada filial (o campo Filial deixa só uma na tela, sem reler o RM); a pessoa marca as salas (ou
 * todas) e Copiar grava só as marcadas que estão na tela: o registro de
 * carteiras e capacidade da sala (OC_SAL_COPIAR_ANO_SALAS, em lotes). Depois relê o plano: o que
 * gravou vira "Igual" e o que falhou fica marcado para copiar de novo. As turmas não vão junto: as
 * de cada ano entram nas salas pela tela Salas → Turmas. A filial entra assim que tem período letivo
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

  readonly anosValidos = computed(() => !!this.anoOrigem() && !!this.anoDestino() && this.anoOrigem() !== this.anoDestino());

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
    // Trocar os anos relê as salas (só leitura). A seleção é dos anos que estavam na tela.
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

  /** Todas as filiais do plano; a tela mostra só a escolhida em `filial`. */
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

    const linhas = [...porChave.entries()].map(([chave, registros]) => {
      const registro = registros[0];
      const aGravar = registros.filter((r) => r.situacao === 'copiar' || r.situacao === 'atualizar').length;
      const erro = falhas.get(chave);
      const estado: EstadoSala = erro
        ? 'falhou'
        : registros.some((r) => r.situacao === 'copiar')
          ? 'nova'
          : registros.some((r) => r.situacao === 'atualizar')
            ? 'muda'
            : 'igual';
      const muda = registros.find((r) => r.situacao === 'atualizar');
      return {
        chave,
        codFilial: registro.codFilial,
        unidade: registro.unidade,
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

    // Por filial; a filial cujas salas não têm período no destino vira só o motivo.
    const filiais = new Map<number, typeof linhas>();
    linhas.forEach((l) => filiais.set(l.codFilial, [...(filiais.get(l.codFilial) ?? []), l]));
    return [...filiais.entries()]
      .sort(([a], [b]) => a - b)
      .map(([codFilial, daFilial]) => {
        const unidade = daFilial.find((l) => l.unidade)?.unidade ?? '';
        const titulo = unidade ? `${unidade} · filial ${codFilial}` : `Filial ${codFilial}`;
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
   * A filial da cópia ('' = todas). Só muda quando a pessoa escolhe: trocar os anos não mexe nela, e
   * se a filial não tiver salas no ano de origem, a lista fica vazia com o aviso.
   */
  readonly filial = signal('');

  /** O nome de cada filial já vista num plano: a escolhida continua com nome num ano em que não aparece. */
  private readonly nomesDasFiliais = linkedSignal<GrupoFilial[], ReadonlyMap<string, string>>({
    source: this.todosOsGrupos,
    computation: (grupos, anterior) =>
      new Map([...(anterior?.value ?? []), ...grupos.map((g) => [String(g.codFilial), g.titulo] as const)]),
  });

  /** As filiais do plano e, se não estiver nele, a escolhida, para o campo nunca perder o valor. */
  readonly filialOptions = computed<SelectOption[]>(() => {
    const nomes = this.nomesDasFiliais();
    const codigos = new Set(this.todosOsGrupos().map((g) => String(g.codFilial)));
    if (this.filial()) codigos.add(this.filial());
    return [
      { value: '', label: 'Todas as filiais' },
      ...[...codigos]
        .sort((a, b) => Number(a) - Number(b))
        .map((c) => ({ value: c, label: nomes.get(c) ?? `Filial ${c}` })),
    ];
  });

  /** O nome da filial escolhida; '' em "Todas as filiais". */
  readonly nomeDaFilial = computed(() => {
    const filial = this.filial();
    return filial ? (this.nomesDasFiliais().get(filial) ?? `Filial ${filial}`) : '';
  });

  readonly grupos = computed<GrupoFilial[]>(() => {
    const filial = this.filial();
    const grupos = this.todosOsGrupos();
    return filial ? grupos.filter((g) => String(g.codFilial) === filial) : grupos;
  });

  private readonly linhas = computed(() => this.grupos().flatMap((g) => g.linhas));
  readonly selecionaveis = computed(() => this.grupos().flatMap((g) => g.selecionaveis));
  readonly marcadas = computed(() => this.linhas().filter((l) => this.selecionadas().has(l.chave)));
  readonly algumaMarcada = computed(() => this.marcadas().length > 0);
  readonly temSalas = computed(() => this.linhas().length > 0);
  readonly tudoIgual = computed(() => this.temSalas() && this.selecionaveis().length === 0 && !this.uiMode.readOnlyMode());
  readonly textoTudoIgual = computed(() => {
    const salas = this.nomeDaFilial() ? `as salas da ${this.nomeDaFilial()}` : 'as salas';
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

  /** Só filtra a lista (o plano já tem todas as filiais). As marcadas saem: o Copiar é da filial que está na tela. */
  escolherFilial(filial: string): void {
    if (this.copiando() || filial === this.filial()) return;
    this.filial.set(filial);
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

  /** O checkbox da filial marca (ou desmarca) as salas dela que têm algo a copiar. */
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

  /** Lê o plano dos dois anos (só leitura). Anos inválidos limpam a lista. */
  private async ler(origem: string, destino: string): Promise<void> {
    const leitura = ++this.leitura;
    this.erroLeitura.set(null);
    if (!origem || !destino || origem === destino) {
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
