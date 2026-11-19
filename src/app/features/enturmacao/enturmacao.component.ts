import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import {
  SaeaAvatarComponent,
  SaeaCheckboxComponent,
  SaeaInputComponent,
  SaeaSelectComponent,
  SaeaSelectOption,
} from '@sistemas-saea/saea-design-system';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  ApiEnturmacaoImportacaoDto,
  ApiEnturmacaoParaImportarDto,
  ApiTurmaEnturmacaoDto,
} from '../../core/models/ocupacao-api.model';
import { AlunosEnturmacaoService } from '../../core/services/alunos-enturmacao.service';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { mesmoCodigo, motivoDaFalha, SalasService, serieDaTurma } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { BadgeComponent, BadgeTone } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

/** "1 aluno", "3 alunos". */
const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Quantas linhas a tabela mostra de cada vez ("Exibir mais" traz outras tantas). */
export const POR_VEZ = 100;

type EstadoDaLista =
  | { estado: 'carregando' }
  | { estado: 'pronto'; alunos: readonly ApiEnturmacaoParaImportarDto[] }
  | { estado: 'erro' };

/** A situação do aluno na enturmação: só o pendente pode ser enturmado. */
export type SituacaoDoAluno = 'pendente' | 'enturmado' | 'revisao';

/**
 * O selo de cada situação, na coluna Situação e no filtro. "revisao" é o IMPORTADO = 2 do MD, que o
 * RM chama de "Inconsistente" (antes "Requer Revisão"): o rótulo segue o RM, em laranja de aviso.
 */
export const SITUACOES: Readonly<Record<SituacaoDoAluno, { rotulo: string; plural: string; tom: BadgeTone }>> = {
  pendente: { rotulo: 'Pendente', plural: 'Pendentes', tom: 'info' },
  enturmado: { rotulo: 'Enturmado', plural: 'Enturmados', tom: 'success' },
  revisao: { rotulo: 'Inconsistente', plural: 'Inconsistentes', tom: 'warning' },
};

/** Um aluno da lista: o id é o RA. */
export interface AlunoParaImportar {
  id: string;
  nome: string;
  /** "5º Ano" (sem o nível e o turno). */
  serie: string;
  /** "5º Ano - Ensino Fundamental": o filtro de série. */
  chaveSerie: string;
  /** "Anos Iniciais": o filtro de segmento (vazio quando o back não manda). */
  segmento: string;
  /** A série da matrícula (curso e habilitação): a troca de turma fica nas turmas dela. Vazios no back antigo. */
  codCurso: string;
  codHabilitacao: string;
  codTurma: string;
  nomeTurma: string;
  situacao: SituacaoDoAluno;
  /** Com "Inconsistente": o motivo que a FV escreveu. */
  obs: string | null;
}

/**
 * Enturmação: os alunos que estão numa turma da pré-enturmação (OC_SAL_ENTUR_PARA_IMPORTAR), com a
 * situação de cada um: pendente (ainda não está na matrícula), enturmado (já está) ou inconsistente
 * (a FV recusou, com o motivo). Lista com filtro de segmento, série, turma e situação (abre em todas, para os
 * já enturmados continuarem à vista) e
 * busca; a secretaria marca os pendentes que vão e enturma. O esqueleto é o da Sala por Ano Letivo
 * (app-card, barra de filtros e ações, tabela), com as peças da lib SAEA.
 *
 * O pendente e o inconsistente trocam de turma pela própria lista (8º A → 8º B), sem voltar à
 * Pré-enturmação: o select mostra as turmas do cadastro da mesma série e grava na hora no MD, como o
 * movimento de lá (OC_SAL_ENTUR_SALVAR). O inconsistente volta a pendente, na turma nova. O
 * enturmado não troca (já está na matrícula).
 *
 * Enturmar roda a FV "EDU - Enturmação" do RM (OC_SAL_ENTUR_IMPORTAR, só no TTESTE por enquanto),
 * com os registros dos marcados: ela grava a turma na matrícula ou manda o aluno para revisão, com o
 * motivo (aí ele volta à turma da matrícula na pré-enturmação). No fim, a tela avisa como ficou cada
 * grupo e relê a lista.
 */
@Component({
  selector: 'app-enturmacao',
  standalone: true,
  imports: [
    FormsModule,
    SaeaAvatarComponent,
    SaeaCheckboxComponent,
    SaeaInputComponent,
    SaeaSelectComponent,
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
  /** O segmento do filtro ("Anos Iniciais"); vazio = todos. */
  readonly segmento = signal('');
  /** A turma de destino do filtro (CODTURMA); vazia = todas. */
  readonly turma = signal('');
  /**
   * A situação do filtro; vazia = todas. Abre em todas: os já enturmados continuam na lista (com o
   * selo verde, sem caixa de marcar), inclusive os que acabaram de ser enturmados.
   */
  readonly situacao = signal<SituacaoDoAluno | ''>('');
  readonly busca = signal('');
  /** Os RAs marcados para enturmar (só pendentes). */
  readonly marcados = signal<ReadonlySet<string>>(new Set());

  private readonly estado = signal<EstadoDaLista | null>(null);
  private leitura: Subscription | null = null;

  readonly carregando = computed(() => this.estado()?.estado === 'carregando');
  readonly comErro = computed(() => this.estado()?.estado === 'erro');
  readonly pronto = computed(() => this.estado()?.estado === 'pronto');

  /** A FV de importação está rodando no RM (ela grava aluno por aluno). */
  readonly importando = signal(false);
  /** As trocas de turma sendo gravadas agora (RA → turma nova): o select já mostra a nova. */
  readonly trocando = signal<ReadonlyMap<string, string>>(new Map());
  /** Quantos alunos foram para a FV: a barra de progresso estima o tempo por eles. */
  private readonly enviadosNaImportacao = signal(0);

  /** O carregando cobre a lista ao ler e ao importar, com o texto e a estimativa de cada um. */
  readonly esperando = computed(() => this.carregando() || this.importando());
  readonly textoDaEspera = computed(() =>
    this.importando()
      ? `Enturmando ${qtd(this.enviadosNaImportacao(), 'aluno', 'alunos')} no RM...`
      : 'Lendo os alunos da enturmação no RM...',
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
   * Quanto a primeira leitura costuma levar, pelo tamanho da unidade. Os alunos já vêm sem foto
   * (~2 s); o que pesa é o MD de enturmação do período, que demora com muitos alunos já importados
   * (CASJ I em 2026: ~1 min; em 2027: ~2 s). Lida há pouco, o back responde na hora.
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

  /** Todos os alunos da unidade na enturmação, em ordem alfabética. */
  readonly alunos = computed<AlunoParaImportar[]>(() => {
    const estado = this.estado();
    if (estado?.estado !== 'pronto') return [];
    return estado.alunos.map(paraTela).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  /** Os segmentos da unidade. O segmento vem antes da série: ele limita as séries. */
  readonly segmentoOptions = computed<SelectOption[]>(() => {
    const segmentos = [...new Set(this.alunos().map((a) => a.segmento).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true }),
    );
    return [{ value: '', label: 'Todos os segmentos' }, ...segmentos.map((s) => ({ value: s, label: s }))];
  });

  /** Os do segmento escolhido (todos, sem filtro). */
  private readonly doSegmento = computed(() => {
    const segmento = this.segmento();
    return segmento ? this.alunos().filter((a) => a.segmento === segmento) : this.alunos();
  });

  /** As séries do segmento escolhido (de todos, sem segmento). */
  readonly serieOptions = computed<SelectOption[]>(() => {
    const series = [...new Set(this.doSegmento().map((a) => a.chaveSerie).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { numeric: true }),
    );
    return [{ value: '', label: 'Todas as séries' }, ...series.map((s) => ({ value: s, label: s }))];
  });

  /** Os do segmento e da série escolhidos. */
  private readonly daSerie = computed(() => {
    const serie = this.serie();
    return serie ? this.doSegmento().filter((a) => a.chaveSerie === serie) : this.doSegmento();
  });

  /** As turmas de destino do segmento e da série escolhidos (de todas, sem filtro), pelo nome: "3º Ano A - Manhã". */
  readonly turmaOptions = computed<SelectOption[]>(() => {
    const turmas = new Map<string, string>();
    this.daSerie().forEach((a) => turmas.set(a.codTurma, a.nomeTurma));
    const opcoes = [...turmas]
      .map(([codTurma, nome]) => ({ value: codTurma, label: rotuloDaTurma(codTurma, nome) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }));
    return [{ value: '', label: 'Todas as turmas' }, ...opcoes];
  });

  /** As turmas do cadastro da unidade no ano (OC_SAL_ENTUR_TURMAS), as mesmas da Pré-enturmação. */
  private readonly turmasDoCadastro = computed<readonly ApiTurmaEnturmacaoDto[]>(() => {
    const filial = this.codFilial();
    if (filial === null) return [];
    const estado = this.alunosService.turmas(this.anoLetivo(), filial);
    return estado?.estado === 'pronto' ? estado.turmas : [];
  });

  /**
   * Para onde cada pendente ou inconsistente pode trocar (RA → opções): as turmas do cadastro da série
   * dele, com a regra da Pré-enturmação (curso e habilitação; sem eles, a série do nome). A turma atual
   * sempre aparece, mesmo antes de o cadastro chegar.
   */
  readonly opcoesDeTurma = computed<ReadonlyMap<string, SaeaSelectOption[]>>(() => {
    const turmas = this.turmasDoCadastro();
    const porSerie = new Map<string, SaeaSelectOption[]>();
    const porRa = new Map<string, SaeaSelectOption[]>();
    this.alunos()
      .filter(podeTrocarDeTurma)
      .forEach((a) => {
        const chave = `${a.codCurso}|${a.codHabilitacao}|${a.chaveSerie}`;
        let daSerie = porSerie.get(chave);
        if (!daSerie) {
          const nomeDaSerie = serieDaTurma(a.chaveSerie);
          daSerie = turmas
            .filter((t) =>
              t.codCurso && t.codHabilitacao && a.codCurso && a.codHabilitacao
                ? mesmoCodigo(t.codCurso, a.codCurso) && mesmoCodigo(t.codHabilitacao, a.codHabilitacao)
                : serieDaTurma(t.nome) === nomeDaSerie,
            )
            .map((t) => ({ value: t.codTurma, label: rotuloDaTurma(t.codTurma, t.nome) }))
            .sort((x, y) => x.label.localeCompare(y.label, 'pt-BR', { numeric: true }));
          porSerie.set(chave, daSerie);
        }
        porRa.set(
          a.id,
          daSerie.some((o) => o.value === a.codTurma)
            ? daSerie
            : [{ value: a.codTurma, label: rotuloDaTurma(a.codTurma, a.nomeTurma) }, ...daSerie],
        );
      });
    return porRa;
  });

  /** Há alunos na enturmação da unidade (em qualquer situação): a barra de ações e a tabela aparecem. */
  readonly temAlunos = computed(() => this.pronto() && this.alunos().length > 0);

  /** Os do segmento, da série e da turma escolhidos, em qualquer situação: a contagem do filtro de situação. */
  private readonly daTurma = computed(() => {
    const turma = this.turma();
    return this.daSerie().filter((a) => !turma || a.codTurma === turma);
  });

  /** As situações, com quantos alunos do segmento, da série e da turma escolhidos têm cada uma. */
  readonly situacaoOptions = computed<SelectOption[]>(() => {
    const alunos = this.daTurma();
    const quantos = (s: SituacaoDoAluno) => alunos.filter((a) => a.situacao === s).length;
    return [
      { value: '', label: `Todas as situações (${alunos.length})` },
      ...(Object.keys(SITUACOES) as SituacaoDoAluno[]).map((s) => ({ value: s, label: `${SITUACOES[s].plural} (${quantos(s)})` })),
    ];
  });

  /** As linhas da lista: segmento, série, turma, situação e busca (nome sem ligar para acento, ou RA). */
  readonly visiveis = computed(() => {
    const situacao = this.situacao();
    const termo = normalizar(this.busca());
    return this.daTurma()
      .filter((a) => !situacao || a.situacao === situacao)
      .filter((a) => !termo || normalizar(a.nome).includes(termo) || a.id.includes(termo));
  });

  /**
   * Quantas linhas da lista aparecem: 100 de cada vez, e "Exibir mais" traz as próximas 100. Uma
   * unidade grande tem mais de mil alunos; desenhar todos (com a foto e o select de turma de cada um)
   * deixa a tela pesada. Mudar a unidade, o ano, um filtro ou a busca volta às 100 primeiras.
   */
  readonly exibindo = linkedSignal({
    source: () => [this.codFilial(), this.anoLetivo(), this.segmento(), this.serie(), this.turma(), this.situacao(), this.busca()],
    computation: () => POR_VEZ,
  });

  /** As linhas que a tabela desenha: as primeiras da lista, até onde o "Exibir mais" chegou. */
  readonly exibidos = computed(() => this.visiveis().slice(0, this.exibindo()));

  /** Quantas da lista ainda não aparecem. */
  readonly faltamExibir = computed(() => this.visiveis().length - this.exibidos().length);

  /** "Exibir mais 100", ou só as que faltam no fim da lista ("Exibir mais 8"). */
  readonly textoExibirMais = computed(() => `Exibir mais ${Math.min(POR_VEZ, this.faltamExibir())}`);

  /** Os pendentes que a tabela mostra: só eles podem ser marcados (o quadrado do cabeçalho marca estes). */
  readonly visiveisPendentes = computed(() => this.exibidos().filter((a) => a.situacao === 'pendente'));

  /** Os marcados que ainda estão na lista e pendentes (a lista relida pode não ter mais algum). */
  readonly alunosMarcados = computed(() => {
    const marcados = this.marcados();
    return this.alunos().filter((a) => a.situacao === 'pendente' && marcados.has(a.id));
  });

  readonly todosVisiveisMarcados = computed(() => {
    const pendentes = this.visiveisPendentes();
    const marcados = this.marcados();
    return pendentes.length > 0 && pendentes.every((a) => marcados.has(a.id));
  });

  /** O quadrado do cabeçalho com traço: parte dos pendentes da lista está marcada. */
  readonly visiveisEmParte = computed(() => {
    const marcados = this.marcados();
    return !this.todosVisiveisMarcados() && this.visiveisPendentes().some((a) => marcados.has(a.id));
  });

  /** "Enturmar", "Enturmar 3 alunos". */
  readonly textoImportar = computed(() => {
    const n = this.alunosMarcados().length;
    return n === 0 ? 'Enturmar' : `Enturmar ${qtd(n, 'aluno', 'alunos')}`;
  });

  /** A linha da lista vazia: o que falta, pela situação do filtro. */
  readonly textoSemResultado = computed(() => {
    const situacao = this.situacao();
    const comFiltro = !!(this.segmento() || this.serie() || this.turma() || this.busca().trim());
    const fim = comFiltro ? ' com esse filtro.' : '.';
    if (situacao === 'pendente') return `Nenhum aluno pendente para enturmar${fim}`;
    if (situacao === 'enturmado') return `Nenhum aluno enturmado${fim}`;
    if (situacao === 'revisao') return `Nenhum aluno inconsistente${fim}`;
    return 'Nenhum aluno com esse filtro.';
  });

  readonly SITUACOES = SITUACOES;

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
    // As fotos de quem a tabela mostra (só as que ainda não vieram; a lista não espera por elas).
    effect(() => {
      const filial = this.codFilial();
      const alunos = this.exibidos().map((a) => ({ ra: a.id, serie: `${a.codCurso}|${a.codHabilitacao}` }));
      const ano = this.anoLetivo();
      if (filial !== null && alunos.length > 0) untracked(() => this.alunosService.fotosPara(ano, filial, alunos));
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
    // Na próxima entrada, os alunos dela já começam a ser lidos.
    if (valor) this.alunosService.lembrarUnidade(this.anoLetivo(), Number(valor));
  }

  /** Trocar o segmento solta a série e a turma que não forem dele. */
  selecionarSegmento(valor: string): void {
    this.segmento.set(valor);
    const serie = this.serie();
    if (serie && !this.doSegmento().some((a) => a.chaveSerie === serie)) this.serie.set('');
    this.soltarTurmaDeFora();
  }

  /** Trocar a série solta a turma, se ela não for da série nova. */
  selecionarSerie(valor: string): void {
    this.serie.set(valor);
    this.soltarTurmaDeFora();
  }

  selecionarTurma(valor: string): void {
    this.turma.set(valor);
  }

  selecionarSituacao(valor: string): void {
    this.situacao.set(valor === 'pendente' || valor === 'enturmado' || valor === 'revisao' ? valor : '');
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

  /** Mostra as próximas 100 linhas da lista (as fotos delas vêm em seguida). */
  exibirMais(): void {
    this.exibindo.update((n) => n + POR_VEZ);
  }

  /** O quadrado do cabeçalho: marca (ou desmarca) todos os pendentes que a tabela mostra agora. */
  alternarVisiveis(marcar: boolean): void {
    const ras = this.visiveisPendentes().map((a) => a.id);
    this.marcados.update((atual) => {
      const proximos = new Set(atual);
      ras.forEach((ra) => (marcar ? proximos.add(ra) : proximos.delete(ra)));
      return proximos;
    });
  }

  limparMarcados(): void {
    this.marcados.set(new Set());
  }

  /** A turma que o select mostra: a nova enquanto a troca grava, senão a do aluno. */
  turmaNaTela(aluno: AlunoParaImportar): string {
    return this.trocando().get(aluno.id) ?? aluno.codTurma;
  }

  /** O select de turma da linha: o pendente e o inconsistente trocam; o enturmado, não. */
  readonly podeTrocarDeTurma = podeTrocarDeTurma;

  /**
   * Troca o pendente ou o inconsistente de turma e grava na hora no MD de enturmação (o mesmo
   * movimento da Pré-enturmação): ele fica pendente na turma nova (o inconsistente sai dessa situação,
   * sem o motivo da FV). Se o RM recusar, o select volta para a turma de antes e o aviso diz por quê.
   */
  trocarTurma(aluno: AlunoParaImportar, codTurma: string | null): void {
    const filial = this.codFilial();
    if (!codTurma || codTurma === aluno.codTurma || filial === null || !podeTrocarDeTurma(aluno)) return;
    if (this.importando() || this.trocando().has(aluno.id)) return;
    const ano = this.anoLetivo();
    const nomeTurma = this.nomeDaTurma(codTurma);
    this.trocando.update((m) => new Map(m).set(aluno.id, codTurma));
    const terminar = () =>
      this.trocando.update((m) => {
        const proximo = new Map(m);
        proximo.delete(aluno.id);
        return proximo;
      });

    this.alunosService.salvar(ano, filial, [{ ra: aluno.id, codTurma }]).subscribe({
      next: (resultados) => {
        const resultado = resultados.find((r) => r.ra === aluno.id);
        if (!resultado || resultado.situacao === 'falhou') {
          terminar();
          this.toast.warning(
            'Não foi possível trocar a turma',
            `${resultado?.motivo ?? 'Não foi possível salvar.'} ${aluno.nome} continua em ${aluno.nomeTurma}.`,
          );
          return;
        }
        // De volta à turma da matrícula, o back deixa o registro como Importado: o aluno fica enturmado.
        const naMatricula = resultado.situacao === 'na-matricula';
        // A lista pode ter mudado de unidade ou de ano enquanto gravava: aí ela já é outra.
        if (this.codFilial() === filial && this.anoLetivo() === ano)
          this.mudarNaLista(aluno.id, codTurma, nomeTurma, naMatricula ? 'importado' : 'pendente');
        terminar();
        if (naMatricula) this.toast.success(`Aluno de volta a ${nomeTurma}`, `${aluno.nome} já está nessa turma na matrícula: fica como enturmado.`);
        else if (aluno.situacao === 'revisao')
          this.toast.success(`Aluno movido para ${nomeTurma}`, `${aluno.nome} deixou de ser inconsistente: está pendente nessa turma, pronto para enturmar.`);
        else this.toast.success(`Aluno movido para ${nomeTurma}`, `${aluno.nome} continua pendente, agora nessa turma.`);
      },
      error: (err) => {
        terminar();
        this.toast.danger('Não foi possível trocar a turma', `${motivoDaFalha(err)} ${aluno.nome} continua em ${aluno.nomeTurma}.`);
      },
    });
  }

  /** O nome da turma no cadastro; sem ele, o código. */
  private nomeDaTurma(codTurma: string): string {
    return this.turmasDoCadastro().find((t) => t.codTurma === codTurma)?.nome ?? codTurma;
  }

  /** Põe o aluno na turma nova na lista que já está na tela, sem reler do RM (a leitura é lenta). */
  private mudarNaLista(ra: string, codTurma: string, nomeTurma: string, situacao: 'pendente' | 'importado'): void {
    const estado = this.estado();
    if (estado?.estado !== 'pronto') return;
    this.estado.set({
      estado: 'pronto',
      alunos: estado.alunos.map((a) => (a.ra === ra ? { ...a, codTurma, nomeTurma, situacao, obs: null } : a)),
    });
  }

  /** A foto do aluno (data URL) ou null: sem ela, o saea-avatar mostra as iniciais. */
  foto(aluno: AlunoParaImportar): string | null {
    const filial = this.codFilial();
    return filial === null ? null : this.alunosService.foto(this.anoLetivo(), filial, aluno.id);
  }

  /** Confirma e enturma os marcados pela FV de enturmação do RM; no fim, avisa como ficou cada grupo e relê a lista. */
  async importar(): Promise<void> {
    const marcados = this.alunosMarcados();
    const filial = this.codFilial();
    const usuario = this.auth.currentUser()?.username;
    // Com uma troca de turma gravando, a FV poderia pegar o registro de antes.
    if (marcados.length === 0 || filial === null || !usuario || this.importando() || this.trocando().size > 0) return;
    const turmas = new Set(marcados.map((a) => a.codTurma)).size;
    const confirmou = await this.confirmDialog.confirm({
      title: `Enturmar ${qtd(marcados.length, 'aluno', 'alunos')} na matrícula?`,
      description:
        `A FV de enturmação do RM grava a turma de destino na matrícula de cada aluno ` +
        `(${qtd(turmas, 'turma', 'turmas')}) e o matricula nas disciplinas dela. Não dá para desfazer por esta tela.`,
      confirmLabel: 'Enturmar',
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
        this.toast.danger('Não foi possível enturmar', motivoDaFalha(err));
        // A FV pode ter passado por parte dos alunos antes de falhar: a lista relida mostra como ficou.
        this.ler(ano, filial);
      },
    });
  }

  /** Um aviso por grupo: enturmados, os que a FV mandou para revisão e os que ela não processou. */
  private avisarResultado(resultado: ApiEnturmacaoImportacaoDto): void {
    if (!resultado.concluido) {
      this.toast.info('O RM ainda está enturmando', 'Recarregue a lista em alguns instantes para ver como ficou cada aluno.');
      return;
    }
    const importados = resultado.alunos.filter((a) => a.situacao === 'importado').length;
    const revisao = resultado.alunos.filter((a) => a.situacao === 'requer-revisao');
    const pendentes = resultado.alunos.length - importados - revisao.length;
    if (importados > 0)
      this.toast.success(qtd(importados, 'aluno enturmado', 'alunos enturmados'), 'Já estão na matrícula, na turma de destino.');
    if (revisao.length > 0) {
      // A FV costuma dar o mesmo motivo para todos; com motivos diferentes, fica só a orientação.
      const motivos = [...new Set(revisao.map((a) => a.obs?.trim()).filter((m): m is string => !!m))];
      this.toast.warning(
        qtd(revisao.length, 'aluno ficou inconsistente', 'alunos ficaram inconsistentes'),
        (motivos.length === 1 ? `${motivos[0]} ` : '') +
          'Ficaram como "Inconsistente": confira a matrícula no RM (na Pré-enturmação eles ficam travados).',
      );
    }
    if (pendentes > 0)
      this.toast.info(qtd(pendentes, 'aluno continua pendente', 'alunos continuam pendentes'), 'A FV não chegou a processar. Tente enturmar de novo.');
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
    // As turmas do cadastro, para a troca de turma: lidas junto (a lista não espera por elas).
    this.alunosService.atualizarTurmas(ano, filial);
    this.leitura = this.api.getParaImportarEnturmacao(usuario, ano, filial).subscribe({
      next: (alunos) => this.estado.set({ estado: 'pronto', alunos }),
      error: () => this.estado.set({ estado: 'erro' }),
    });
  }

  /** A turma escolhida que não está mais entre as do segmento e da série volta para todas. */
  private soltarTurmaDeFora(): void {
    const turma = this.turma();
    if (turma && !this.daSerie().some((a) => a.codTurma === turma)) this.turma.set('');
  }

  private limparFiltros(): void {
    this.segmento.set('');
    this.serie.set('');
    this.turma.set('');
    this.situacao.set('');
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
    segmento: dto.segmento?.trim() ?? '',
    codCurso: dto.codCurso?.trim() ?? '',
    codHabilitacao: dto.codHabilitacao?.trim() ?? '',
    codTurma: dto.codTurma,
    nomeTurma: dto.nomeTurma,
    // Sem o campo (backend de antes desta versão), vêm só os pendentes.
    situacao: dto.situacao === 'importado' ? 'enturmado' : dto.situacao === 'requer-revisao' ? 'revisao' : 'pendente',
    obs: dto.situacao === 'requer-revisao' ? dto.obs?.trim() || null : null,
  };
}

/** O pendente e o inconsistente trocam de turma; o enturmado já está na matrícula e não troca por aqui. */
function podeTrocarDeTurma(aluno: AlunoParaImportar): boolean {
  return aluno.situacao !== 'enturmado';
}

/** "3º Ano A - Manhã (EF3A-M)"; sem nome, só o código. */
function rotuloDaTurma(codTurma: string, nome: string): string {
  return !nome || nome === codTurma ? codTurma : `${nome} (${codTurma})`;
}

/** Sem acento, em minúsculas e sem espaços nas pontas: para a busca. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
