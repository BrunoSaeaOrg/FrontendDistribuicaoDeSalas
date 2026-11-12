import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SaeaAvatarComponent,
  SaeaCheckboxComponent,
  SaeaInputComponent,
  SaeaTab,
  SaeaTabsComponent,
} from '@sistemas-saea/saea-design-system';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiEnturmacaoParaImportarDto, ApiSituacaoEnturmacao } from '../../core/models/ocupacao-api.model';
import { AlunosEnturmacaoService } from '../../core/services/alunos-enturmacao.service';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

/** "1 aluno", "3 alunos". */
const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A aba da lista: todos, ou só uma situação. */
export type AbaDaEnturmacao = 'todos' | ApiSituacaoEnturmacao;

type EstadoDaLista =
  | { estado: 'carregando' }
  | { estado: 'pronto'; alunos: readonly ApiEnturmacaoParaImportarDto[] }
  | { estado: 'erro' };

/** Um aluno da lista: o id é o RA. */
export interface AlunoParaImportar {
  id: string;
  /** O nome da matrícula; sem ela (o aluno saiu da unidade no ano), um aviso no lugar. */
  nome: string;
  semMatricula: boolean;
  /** "5º Ano" (sem o nível e o turno); "—" sem matrícula. */
  serie: string;
  /** "5º Ano - Ensino Fundamental": o filtro de série. Vazio sem matrícula. */
  chaveSerie: string;
  codTurma: string;
  nomeTurma: string;
  situacao: ApiSituacaoEnturmacao;
  obs: string | null;
}

/**
 * Enturmação: os alunos movidos na pré-enturmação que ainda não entraram na matrícula, para a
 * secretaria importar. São os registros do MD de enturmação Pendentes ou que Requerem Revisão
 * (OC_SAL_ENTUR_PARA_IMPORTAR), numa lista com abas por situação, filtro de série e busca. A
 * secretaria marca quem vai e importa. O esqueleto é o da Sala por Ano Letivo (app-card, barra de
 * filtros e ações, tabela), com as peças da lib SAEA (abas, avatar, checkbox, campo de busca).
 *
 * A importação no RM ainda não existe: o botão confirma, avisa que nada foi enviado e os alunos
 * continuam pendentes. Quando ela existir, o envio entra em {@link importar}.
 */
@Component({
  selector: 'app-enturmacao',
  standalone: true,
  imports: [
    FormsModule,
    SaeaAvatarComponent,
    SaeaCheckboxComponent,
    SaeaInputComponent,
    SaeaTabsComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CarregandoComponent,
    EmptyStateComponent,
    SelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './enturmacao.component.html',
  styleUrl: './enturmacao.component.css',
})
export class EnturmacaoComponent {
  private readonly api = inject(OcupacaoApiService);
  private readonly auth = inject(AuthService);
  private readonly salasService = inject(SalasService);
  private readonly alunosService = inject(AlunosEnturmacaoService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly anoLetivo = this.salasService.anoLetivo;
  /** O ano escolhido ainda não chegou: as unidades seriam as do ano anterior. */
  readonly carregandoSalas = computed(() => this.salasService.anoCarregado() !== this.anoLetivo());

  readonly codFilial = signal<number | null>(null);
  /** A série do filtro ("5º Ano - Ensino Fundamental"); vazia = todas. */
  readonly serie = signal('');
  /** A turma de destino do filtro (CODTURMA); vazia = todas. */
  readonly turma = signal('');
  readonly aba = signal<AbaDaEnturmacao>('todos');
  readonly busca = signal('');
  /** Os RAs marcados para importar. */
  readonly marcados = signal<ReadonlySet<string>>(new Set());

  private readonly estado = signal<EstadoDaLista | null>(null);
  private leitura: Subscription | null = null;

  readonly carregando = computed(() => this.estado()?.estado === 'carregando');
  readonly comErro = computed(() => this.estado()?.estado === 'erro');
  readonly pronto = computed(() => this.estado()?.estado === 'pronto');

  readonly anoOptions = computed<SelectOption[]>(() =>
    this.salasService.anosLetivos().map((ano) => ({ value: ano, label: ano })),
  );

  readonly unidadeOptions = computed<SelectOption[]>(() => {
    if (this.carregandoSalas()) return [{ value: '', label: 'Carregando...' }];
    const filiais = [...new Set(this.salasService.unidades().map((u) => u.codFilial))]
      .map((codFilial) => ({ value: String(codFilial), label: this.salasService.nomeDaFilial(codFilial) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    return [{ value: '', label: 'Selecione a unidade' }, ...filiais];
  });

  /**
   * Quanto a primeira leitura costuma levar, pelo tamanho da unidade: ela espera a dos alunos, que
   * traz a foto de cada um (a mesma conta da Pré-enturmação). Lida há pouco, o back responde na hora.
   */
  readonly estimativa = computed(() => {
    const filial = this.codFilial();
    if (filial === null) return null;
    const nasSalas = this.salasService
      .salas()
      .filter((s) => s.codFilial === filial)
      .flatMap((s) => [...(s.turnos.manha ?? []), ...(s.turnos.tarde ?? [])])
      .reduce((total, t) => total + t.alunos, 0);
    const semSala = this.salasService
      .turmasLivres()
      .filter((t) => t.codFilial === filial)
      .reduce((total, t) => total + t.alunos, 0);
    return 3000 + (nasSalas + semSala) * 11;
  });

  /** Todos os alunos da unidade para importar, em ordem alfabética. */
  readonly alunos = computed<AlunoParaImportar[]>(() => {
    const estado = this.estado();
    if (estado?.estado !== 'pronto') return [];
    return estado.alunos.map(paraTela).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  readonly serieOptions = computed<SelectOption[]>(() => {
    const series = [...new Set(this.alunos().map((a) => a.chaveSerie).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true }),
    );
    return [{ value: '', label: 'Todas as séries' }, ...series.map((s) => ({ value: s, label: s }))];
  });

  /** Os da série escolhida (todas, sem filtro). */
  private readonly daSerie = computed(() => {
    const serie = this.serie();
    return serie ? this.alunos().filter((a) => a.chaveSerie === serie) : this.alunos();
  });

  /** As turmas de destino da série escolhida (de todas, sem série), pelo nome: "3º Ano A - Manhã". */
  readonly turmaOptions = computed<SelectOption[]>(() => {
    const turmas = new Map<string, string>();
    this.daSerie().forEach((a) => turmas.set(a.codTurma, a.nomeTurma));
    const opcoes = [...turmas]
      .map(([codTurma, nome]) => ({ value: codTurma, label: nome === codTurma ? codTurma : `${nome} (${codTurma})` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }));
    return [{ value: '', label: 'Todas as turmas' }, ...opcoes];
  });

  /** Os da série e da turma escolhidas: as abas contam a partir daqui. */
  private readonly daSerieETurma = computed(() => {
    const turma = this.turma();
    return turma ? this.daSerie().filter((a) => a.codTurma === turma) : this.daSerie();
  });

  /** Há alunos para importar na unidade: a barra de ações, as abas e a tabela aparecem. */
  readonly temAlunos = computed(() => this.pronto() && this.alunos().length > 0);

  /** As abas do saea-tabs, com quantos alunos cada situação tem na série e na turma escolhidas. */
  readonly abas = computed<SaeaTab[]>(() => {
    const lista = this.daSerieETurma();
    const revisao = lista.filter((a) => a.situacao === 'requer-revisao').length;
    return [
      { value: 'todos', label: `Todos (${lista.length})` },
      { value: 'pendente', label: `Pendentes (${lista.length - revisao})` },
      { value: 'requer-revisao', label: `Requer revisão (${revisao})` },
    ];
  });

  /** As linhas da lista: série, turma, aba e busca (nome sem ligar para acento, ou RA). */
  readonly visiveis = computed(() => {
    const aba = this.aba();
    const termo = normalizar(this.busca());
    return this.daSerieETurma()
      .filter((a) => aba === 'todos' || a.situacao === aba)
      .filter((a) => !termo || normalizar(a.nome).includes(termo) || a.id.includes(termo));
  });

  /** Os marcados que ainda estão na lista (a lista relida pode não ter mais algum). */
  readonly alunosMarcados = computed(() => {
    const marcados = this.marcados();
    return this.alunos().filter((a) => marcados.has(a.id));
  });

  readonly todosVisiveisMarcados = computed(() => {
    const visiveis = this.visiveis();
    const marcados = this.marcados();
    return visiveis.length > 0 && visiveis.every((a) => marcados.has(a.id));
  });

  /** O quadrado do cabeçalho com traço: parte dos alunos da lista está marcada. */
  readonly visiveisEmParte = computed(() => {
    const marcados = this.marcados();
    return !this.todosVisiveisMarcados() && this.visiveis().some((a) => marcados.has(a.id));
  });

  /** Os pendentes que a lista mostra agora (série, turma, aba e busca). */
  private readonly pendentesVisiveis = computed(() => this.visiveis().filter((a) => a.situacao === 'pendente'));

  /** Todos os pendentes da lista já estão marcados: o botão passa a desmarcá-los. */
  readonly pendentesMarcados = computed(() => {
    const pendentes = this.pendentesVisiveis();
    const marcados = this.marcados();
    return pendentes.length > 0 && pendentes.every((a) => marcados.has(a.id));
  });

  readonly temPendentesVisiveis = computed(() => this.pendentesVisiveis().length > 0);

  /** "Importar", "Importar 3 alunos". */
  readonly textoImportar = computed(() => {
    const n = this.alunosMarcados().length;
    return n === 0 ? 'Importar' : `Importar ${qtd(n, 'aluno', 'alunos')}`;
  });

  /** "Nenhum aluno marcado", "3 alunos marcados · 2 turmas". */
  readonly resumoDaSelecao = computed(() => {
    const marcados = this.alunosMarcados();
    if (marcados.length === 0) return 'Nenhum aluno marcado';
    const turmas = new Set(marcados.map((a) => a.codTurma)).size;
    return `${qtd(marcados.length, 'aluno marcado', 'alunos marcados')} · ${qtd(turmas, 'turma', 'turmas')}`;
  });

  constructor() {
    // A unidade (ou o ano) escolhida relê a lista.
    effect(() => {
      const filial = this.codFilial();
      const ano = this.anoLetivo();
      if (filial !== null && !this.carregandoSalas()) untracked(() => this.ler(ano, filial));
    });
    // As fotos de quem está na lista (só as que ainda não vieram; a lista não espera por elas).
    effect(() => {
      const filial = this.codFilial();
      const ras = this.visiveis().map((a) => a.id);
      const ano = this.anoLetivo();
      if (filial !== null && ras.length > 0) untracked(() => this.alunosService.fotosPara(ano, filial, ras));
    });
    inject(DestroyRef).onDestroy(() => this.leitura?.unsubscribe());
  }

  selecionarAno(ano: string): void {
    this.codFilial.set(null);
    this.limparFiltros();
    this.salasService.selecionarAno(ano);
  }

  selecionarUnidade(valor: string): void {
    this.codFilial.set(valor ? Number(valor) : null);
    this.limparFiltros();
  }

  /** Trocar a série solta a turma, se ela não for da série nova. */
  selecionarSerie(valor: string): void {
    this.serie.set(valor);
    const turma = this.turma();
    if (turma && !this.daSerie().some((a) => a.codTurma === turma)) this.turma.set('');
  }

  selecionarTurma(valor: string): void {
    this.turma.set(valor);
  }

  escolherAba(valor: string | undefined): void {
    if (valor === 'todos' || valor === 'pendente' || valor === 'requer-revisao') this.aba.set(valor);
  }

  tentarDeNovo(): void {
    const filial = this.codFilial();
    if (filial !== null) this.ler(this.anoLetivo(), filial);
  }

  marcado(ra: string): boolean {
    return this.marcados().has(ra);
  }

  definirMarcado(ra: string, marcar: boolean): void {
    this.marcados.update((atual) => {
      const proximos = new Set(atual);
      if (marcar) proximos.add(ra);
      else proximos.delete(ra);
      return proximos;
    });
  }

  /** O quadrado do cabeçalho: marca (ou desmarca) todos os que a lista mostra agora. */
  alternarVisiveis(marcar: boolean): void {
    const ras = this.visiveis().map((a) => a.id);
    this.marcados.update((atual) => {
      const proximos = new Set(atual);
      ras.forEach((ra) => (marcar ? proximos.add(ra) : proximos.delete(ra)));
      return proximos;
    });
  }

  /**
   * Marca os pendentes que a lista mostra (com os filtros); se já estão todos marcados, desmarca. Os
   * que requerem revisão ficam como estão.
   */
  alternarPendentes(): void {
    const ras = this.pendentesVisiveis().map((a) => a.id);
    const desmarcar = this.pendentesMarcados();
    this.marcados.update((atual) => {
      const proximos = new Set(atual);
      ras.forEach((ra) => (desmarcar ? proximos.delete(ra) : proximos.add(ra)));
      return proximos;
    });
  }

  limparMarcados(): void {
    this.marcados.set(new Set());
  }

  /** A foto do aluno (data URL) ou null: sem ela, o saea-avatar mostra as iniciais. */
  foto(aluno: AlunoParaImportar): string | null {
    const filial = this.codFilial();
    return filial === null ? null : this.alunosService.foto(this.anoLetivo(), filial, aluno.id);
  }

  /**
   * Confirma a importação dos marcados. A importação no RM ainda não existe: confirmada, a tela avisa
   * que nada foi enviado e os alunos continuam pendentes (e marcados). O envio entra aqui.
   */
  async importar(): Promise<void> {
    const marcados = this.alunosMarcados();
    if (marcados.length === 0) return;
    const turmas = new Set(marcados.map((a) => a.codTurma)).size;
    const revisao = marcados.filter((a) => a.situacao === 'requer-revisao').length;
    const aviso =
      revisao === 0
        ? ''
        : revisao === 1
          ? ' 1 deles requer revisão: confira a observação antes.'
          : ` ${revisao} deles requerem revisão: confira as observações antes.`;
    const confirmou = await this.confirmDialog.confirm({
      title: `Importar ${qtd(marcados.length, 'aluno', 'alunos')} para a matrícula?`,
      description: `Cada aluno entra na turma de destino (${qtd(turmas, 'turma', 'turmas')}).${aviso}`,
      confirmLabel: 'Importar',
    });
    if (!confirmou) return;
    this.toast.info('A importação ainda não está ligada ao RM', 'Nada foi enviado: os alunos continuam pendentes.');
  }

  private ler(ano: string, filial: number): void {
    this.leitura?.unsubscribe();
    this.marcados.set(new Set());
    this.estado.set({ estado: 'carregando' });
    const usuario = this.auth.currentUser()?.username;
    if (!usuario) {
      this.estado.set({ estado: 'erro' });
      return;
    }
    this.leitura = this.api.getParaImportarEnturmacao(usuario, ano, filial).subscribe({
      next: (alunos) => this.estado.set({ estado: 'pronto', alunos }),
      error: () => this.estado.set({ estado: 'erro' }),
    });
  }

  private limparFiltros(): void {
    this.serie.set('');
    this.turma.set('');
    this.aba.set('todos');
    this.busca.set('');
    this.marcados.set(new Set());
  }
}

function paraTela(dto: ApiEnturmacaoParaImportarDto): AlunoParaImportar {
  const partes = (dto.serie ?? '').split(' - ');
  return {
    id: dto.ra,
    nome: dto.nome?.trim() || 'Sem matrícula ativa no ano',
    semMatricula: !dto.nome?.trim(),
    serie: partes[0] || '—',
    chaveSerie: dto.serie ? partes.slice(0, 2).join(' - ') : '',
    codTurma: dto.codTurma,
    nomeTurma: dto.nomeTurma,
    situacao: dto.situacao,
    obs: dto.obs?.trim() || null,
  };
}

/** Sem acento, em minúsculas e sem espaços nas pontas: para a busca. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
