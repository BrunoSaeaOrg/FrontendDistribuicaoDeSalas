import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { SaeaAvatarComponent, SaeaCheckboxComponent, SaeaInputComponent } from '@sistemas-saea/saea-design-system';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiEnturmacaoImportacaoDto, ApiEnturmacaoParaImportarDto } from '../../core/models/ocupacao-api.model';
import { AlunosEnturmacaoService } from '../../core/services/alunos-enturmacao.service';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { motivoDaFalha, SalasService } from '../../core/services/salas.service';
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

type EstadoDaLista =
  | { estado: 'carregando' }
  | { estado: 'pronto'; alunos: readonly ApiEnturmacaoParaImportarDto[] }
  | { estado: 'erro' };

/** Um aluno da lista: o id é o RA. */
export interface AlunoParaImportar {
  id: string;
  nome: string;
  /** "5º Ano" (sem o nível e o turno). */
  serie: string;
  /** "5º Ano - Ensino Fundamental": o filtro de série. */
  chaveSerie: string;
  codTurma: string;
  nomeTurma: string;
}

/**
 * Enturmação: os alunos que estão numa turma da pré-enturmação e ainda não entraram na matrícula,
 * para a secretaria importar (OC_SAL_ENTUR_PARA_IMPORTAR). São os mesmos que a pré-enturmação mostra
 * pendentes nas turmas de destino; quem requer revisão fica de fora, como lá. Lista com filtro de
 * série e turma e busca; a secretaria marca quem vai e importa. O esqueleto é o da Sala por Ano
 * Letivo (app-card, barra de filtros e ações, tabela), com as peças da lib SAEA.
 *
 * Importar roda a FV "EDU - Enturmação" do RM (OC_SAL_ENTUR_IMPORTAR, só no TTESTE por enquanto),
 * com os registros dos marcados: ela grava a turma na matrícula ou manda o aluno para revisão, com o
 * motivo (aí ele sai daqui e volta à turma da matrícula na pré-enturmação). No fim, a tela avisa
 * como ficou cada grupo e relê a lista.
 */
@Component({
  selector: 'app-enturmacao',
  standalone: true,
  imports: [
    FormsModule,
    SaeaAvatarComponent,
    SaeaCheckboxComponent,
    SaeaInputComponent,
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
  readonly busca = signal('');
  /** Os RAs marcados para importar. */
  readonly marcados = signal<ReadonlySet<string>>(new Set());

  private readonly estado = signal<EstadoDaLista | null>(null);
  private leitura: Subscription | null = null;

  readonly carregando = computed(() => this.estado()?.estado === 'carregando');
  readonly comErro = computed(() => this.estado()?.estado === 'erro');
  readonly pronto = computed(() => this.estado()?.estado === 'pronto');

  /** A FV de importação está rodando no RM (ela grava aluno por aluno). */
  readonly importando = signal(false);
  /** Quantos alunos foram para a FV: a barra de progresso estima o tempo por eles. */
  private readonly enviadosNaImportacao = signal(0);

  /** O carregando cobre a lista ao ler e ao importar, com o texto e a estimativa de cada um. */
  readonly esperando = computed(() => this.carregando() || this.importando());
  readonly textoDaEspera = computed(() =>
    this.importando()
      ? `Importando ${qtd(this.enviadosNaImportacao(), 'aluno', 'alunos')} no RM...`
      : 'Lendo os alunos para importar no RM...',
  );
  readonly estimativaDaEspera = computed(() =>
    this.importando() ? 5000 + this.enviadosNaImportacao() * 1500 : this.estimativa(),
  );

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

  /** Há alunos para importar na unidade: a barra de ações e a tabela aparecem. */
  readonly temAlunos = computed(() => this.pronto() && this.alunos().length > 0);

  /** As linhas da lista: série, turma e busca (nome sem ligar para acento, ou RA). */
  readonly visiveis = computed(() => {
    const turma = this.turma();
    const termo = normalizar(this.busca());
    return this.daSerie()
      .filter((a) => !turma || a.codTurma === turma)
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

  limparMarcados(): void {
    this.marcados.set(new Set());
  }

  /** A foto do aluno (data URL) ou null: sem ela, o saea-avatar mostra as iniciais. */
  foto(aluno: AlunoParaImportar): string | null {
    const filial = this.codFilial();
    return filial === null ? null : this.alunosService.foto(this.anoLetivo(), filial, aluno.id);
  }

  /** Confirma e importa os marcados pela FV de enturmação do RM; no fim, avisa como ficou cada grupo e relê a lista. */
  async importar(): Promise<void> {
    const marcados = this.alunosMarcados();
    const filial = this.codFilial();
    const usuario = this.auth.currentUser()?.username;
    if (marcados.length === 0 || filial === null || !usuario || this.importando()) return;
    const turmas = new Set(marcados.map((a) => a.codTurma)).size;
    const confirmou = await this.confirmDialog.confirm({
      title: `Importar ${qtd(marcados.length, 'aluno', 'alunos')} para a matrícula?`,
      description:
        `A FV de enturmação do RM grava a turma de destino na matrícula de cada aluno ` +
        `(${qtd(turmas, 'turma', 'turmas')}) e o matricula nas disciplinas dela. Não dá para desfazer por esta tela.`,
      confirmLabel: 'Importar',
    });
    if (!confirmou) return;

    const ano = this.anoLetivo();
    const ras = marcados.map((a) => a.id);
    this.enviadosNaImportacao.set(marcados.length);
    this.importando.set(true);
    // Depuração da importação (fora de produção): o que vai, o que volta e o log da FV no RM.
    if (!environment.production) {
      console.info('[importação] enviando para a FV:', { ano, filial, ras, turmas: marcados.map((a) => `${a.id} → ${a.codTurma}`) });
    }
    this.api.importarEnturmacao(usuario, ano, filial, ras).subscribe({
      next: (resultado) => {
        if (!environment.production) {
          console.info('[importação] resposta:', resultado);
          console.info('[importação] log da FV no RM:\n' + (resultado.logDaFv ?? '(sem mensagem)'));
        }
        this.importando.set(false);
        this.avisarResultado(resultado);
        this.ler(ano, filial);
      },
      error: (err) => {
        if (!environment.production) console.error('[importação] erro:', err);
        this.importando.set(false);
        this.toast.danger('Não foi possível importar', motivoDaFalha(err));
        // A FV pode ter passado por parte dos alunos antes de falhar: a lista relida mostra como ficou.
        this.ler(ano, filial);
      },
    });
  }

  /** Um aviso por grupo: importados, os que a FV mandou para revisão e os que ela não processou. */
  private avisarResultado(resultado: ApiEnturmacaoImportacaoDto): void {
    if (!resultado.concluido) {
      this.toast.info('O RM ainda está importando', 'Recarregue a lista em alguns instantes para ver como ficou cada aluno.');
      return;
    }
    const importados = resultado.alunos.filter((a) => a.situacao === 'importado').length;
    const revisao = resultado.alunos.filter((a) => a.situacao === 'requer-revisao');
    const pendentes = resultado.alunos.length - importados - revisao.length;
    if (importados > 0)
      this.toast.success(qtd(importados, 'aluno importado', 'alunos importados'), 'Já estão na matrícula, na turma de destino.');
    if (revisao.length > 0) {
      // A FV costuma dar o mesmo motivo para todos; com motivos diferentes, fica só a orientação.
      const motivos = [...new Set(revisao.map((a) => a.obs?.trim()).filter((m): m is string => !!m))];
      this.toast.warning(
        qtd(revisao.length, 'aluno requer revisão', 'alunos requerem revisão'),
        (motivos.length === 1 ? `${motivos[0]} ` : '') +
          'Saíram desta lista: confira a matrícula no RM e mova de novo na Pré-enturmação.',
      );
    }
    if (pendentes > 0)
      this.toast.info(qtd(pendentes, 'aluno continua pendente', 'alunos continuam pendentes'), 'A FV não chegou a processar. Tente importar de novo.');
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
    this.busca.set('');
    this.marcados.set(new Set());
  }
}

function paraTela(dto: ApiEnturmacaoParaImportarDto): AlunoParaImportar {
  const partes = dto.serie.split(' - ');
  return {
    id: dto.ra,
    nome: dto.nome.trim() || `RA ${dto.ra}`,
    serie: partes[0] || '—',
    chaveSerie: partes.slice(0, 2).join(' - '),
    codTurma: dto.codTurma,
    nomeTurma: dto.nomeTurma,
  };
}

/** Sem acento, em minúsculas e sem espaços nas pontas: para a busca. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
