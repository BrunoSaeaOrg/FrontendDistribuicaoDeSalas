import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CdkConnectedOverlay, ConnectedPosition } from '@angular/cdk/overlay';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SaeaBadgeComponent, SaeaCheckboxComponent, SaeaInputComponent, SaeaTooltipDirective } from '@sistemas-saea/saea-design-system';
import { nomeDoAndar, Turno } from '../../core/models';
import { ApiAlunoEnturmacaoDto, ApiTurmaEnturmacaoDto } from '../../core/models/ocupacao-api.model';
import { AlunosEnturmacaoService, SelecaoDaTela } from '../../core/services/alunos-enturmacao.service';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService, serieDaTurma } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { AlertComponent } from '../../shared/ui/alert/alert.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CarregandoComponent } from '../../shared/ui/carregando/carregando.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';
import { FAIXAS, FaixaOcupacao, faixaDe } from '../ocupacao/ocupacao-calculo';

/** "1 aluno", "3 alunos". */
const qtdAlunos = (n: number) => `${n} ${n === 1 ? 'aluno' : 'alunos'}`;

/** Os alunos da série que ainda não têm turma. */
export const SEM_TURMA = 'sem-turma';

/** "Maria da Silva" → "Maria da Silva", não "Maria da": a partícula vai com o nome seguinte. */
const PARTICULAS = new Set(['da', 'das', 'de', 'di', 'do', 'dos', 'du', 'e']);

/**
 * Arrastando vários alunos, a imagem do arraste é uma etiqueta com quantos são. O navegador tira
 * a foto do elemento na hora: ele entra na página só por um instante.
 */
function definirImagemDoArrasto(dados: DataTransfer, texto: string): void {
  if (typeof document === 'undefined' || typeof dados.setDragImage !== 'function') return;
  const etiqueta = document.createElement('div');
  etiqueta.textContent = texto;
  Object.assign(etiqueta.style, {
    position: 'fixed',
    top: '-100px',
    left: '0',
    padding: '6px 12px',
    borderRadius: '999px',
    background: 'var(--saea-primary-strong)',
    color: '#fff',
    font: '600 13px system-ui, sans-serif',
  });
  document.body.appendChild(etiqueta);
  dados.setDragImage(etiqueta, 16, 16);
  setTimeout(() => etiqueta.remove());
}

const ROTULO_TURNO: Record<Turno, string> = { manha: 'Manhã', tarde: 'Tarde' };

export type Lado = 'origem' | 'destino';

/** Aluno na tela: o id é o RA. */
export interface AlunoDaTela {
  id: string;
  nome: string;
  /**
   * Turma do aluno no RM (null = sem turma): de onde ele sai se for movido. É a do movimento já
   * gravado no MD de enturmação, se houver; senão, a da matrícula.
   */
  codTurmaOriginal: string | null;
  /** Turma da matrícula (API.OC.ENTUR.GER). */
  codTurmaMatricula: string | null;
  /** Tem movimento gravado no MD que ainda não entrou na matrícula. */
  gravadoNoRm: boolean;
  novo: boolean;
  turmaAnterior: string | null;
  /** CODCURSO|CODHABILITACAO: a série do aluno. */
  serie: string;
  /** O período do aluno ("M", "SM", "I", "T", "ST" ou "?"): na origem, ele fica no grupo desse período. */
  periodo: string;
  /** A série como vem do RM: "9º Ano - Ensino Fundamental - Manhã - EF II". */
  serieNome: string;
  serieAnterior: string | null;
  /** A escola de onde o aluno veio, quando o RM tem. */
  instituicaoOrigem: string | null;
  /** "24/11/2025". */
  dataMatricula: string | null;
  obs: string | null;
}

/** Um dado do aluno no detalhe que abre embaixo da linha dele, na origem. */
export interface DadoDoAluno {
  rotulo: string;
  valor: string;
  /** Texto menor depois do valor: o nível da série ("Ensino Fundamental" depois de "4º Ano"). */
  complemento?: string;
  /** Ícone do Material Icons antes do valor (o sol do período da manhã). */
  icone?: string;
}

/** Uma série da unidade, com os alunos dela. */
interface SerieDaUnidade {
  chave: string;
  /** "3º Ano - Ensino Fundamental". */
  rotulo: string;
  qtd: number;
}

/** Sala de uma turma num turno: as turmas do mesmo turno na sala dividem as carteiras. */
interface SalaDaTurma {
  id: string;
  nome: string;
  andar: string;
  carteiras: number;
  turno: Turno;
  codFilial: number;
  /** As turmas da sala nesse turno (a própria incluída). */
  turmasNoTurno: string[];
}

/** Turma da série que pode ser origem ou destino. */
export interface TurmaDaSerie {
  /** CODTURMA, ou SEM_TURMA. */
  id: string;
  nome: string;
  turno: string;
  sala: SalaDaTurma | null;
}

/** Lotação de uma sala no turno da turma, contra as carteiras, com a previsão se os marcados vierem. */
export interface Lotacao {
  alunos: number;
  carteiras: number;
  /** Alunos se os marcados do outro lado vierem; igual a `alunos` sem marcados. */
  previstos: number;
  faixa: FaixaOcupacao;
  rotulo: string;
  icone: string;
  /** Carteiras que sobram com a previsão (negativo = faltam carteiras). */
  vagas: number;
  /** "3 vagas", "1 vaga", "Sem vagas" ou "Faltam 2 carteiras"; vazio = sem selo (sala sem carteiras). */
  rotuloVagas: string;
  /** O tom do selo das vagas: o da faixa. */
  tom: 'success' | 'warning' | 'danger';
  /** Barra: largura de agora e da previsão, no máximo 100. */
  pct: number;
  pctPrevisto: number;
  /** As outras turmas que dividem a sala nesse turno. */
  dividemCom: string[];
}

export interface PainelDaTurma {
  lado: Lado;
  turma: TurmaDaSerie;
  alunos: AlunoDaTela[];
  /** Os alunos que a lista mostra: os que batem com a busca, em ordem alfabética (A a Z ou Z a A). */
  visiveis: AlunoDaTela[];
  /** A busca deste lado, sem espaços nas pontas; vazia, a lista mostra todos. */
  busca: string;
  lotacao: Lotacao | null;
  /** Marcados deste lado. */
  marcados: number;
}

/**
 * Vincular aluno à turma, lado a lado: escolhe-se a unidade e a série; à esquerda fica a turma de
 * origem e à direita a de destino, com as fotos dos alunos. Marca-se e move-se de um lado para o
 * outro, vendo como a sala de cada turma fica (as turmas do mesmo turno na sala somam).
 *
 * Os dados são reais: as turmas do destino vêm do cadastro (OC_SAL_ENTUR_TURMAS), a sala e as
 * carteiras de cada uma do SalasService, alunos e fotos da pré-enturmação do RM
 * (OC_SAL_ENTUR_ALUNOS e OC_SAL_ENTUR_FOTOS). Mover muda só a tela; "Salvar" grava os
 * movimentos no MD de enturmação como pendentes (OC_SAL_ENTUR_SALVAR, só no TTESTE por enquanto),
 * e a matrícula muda quando a enturmação for importada no RM. Os já gravados (OC_SAL_ENTUR_PENDENTES)
 * aparecem na turma nova, com a etiqueta "gravado".
 */
@Component({
  selector: 'app-vincular-alunos',
  standalone: true,
  imports: [
    CdkConnectedOverlay,
    FormsModule,
    NgTemplateOutlet,
    SaeaBadgeComponent,
    SaeaCheckboxComponent,
    SaeaInputComponent,
    SaeaTooltipDirective,
    AlertComponent,
    ButtonComponent,
    CarregandoComponent,
    EmptyStateComponent,
    SelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vincular-alunos.component.html',
  styleUrl: './vincular-alunos.component.css',
})
export class VincularAlunosComponent {
  private readonly toast = inject(ToastService);
  private readonly salasService = inject(SalasService);
  private readonly regras = inject(RegrasService);
  private readonly alunosService = inject(AlunosEnturmacaoService);

  readonly qtdAlunos = qtdAlunos;
  readonly SEM_TURMA = SEM_TURMA;

  /**
   * A escolha de antes, se o app recriou a tela (celular ↔ computador, troca de layout) ou se ela
   * foi aberta de novo no mesmo ano. De outro ano, a tela começa do zero.
   */
  private readonly retomada = retomar(this.alunosService.selecao, this.salasService.anoLetivo());

  readonly codFilial = signal<number | null>(this.retomada?.codFilial ?? null);
  readonly serie = signal(this.retomada?.serie ?? '');
  readonly origemId = signal<string | null>(this.retomada?.origemId ?? null);
  readonly destinoId = signal<string | null>(this.retomada?.destinoId ?? null);
  readonly marcadosOrigem = signal<ReadonlySet<string>>(new Set());
  readonly marcadosDestino = signal<ReadonlySet<string>>(new Set());
  /** Os últimos movidos: ficam no começo da turma em que entraram, destacados. */
  readonly recemMovidos = signal<ReadonlySet<string>>(new Set());
  /** Para onde cada aluno foi movido (RA → CODTURMA ou SEM_TURMA), por "ano|filial". Fica no service: sobrevive à tela. */
  private readonly movimentos = this.alunosService.movimentos;
  /** Quantos movimentos estão sendo salvos agora (0 = nenhum). */
  readonly salvando = this.alunosService.salvando;
  /** Por que o movimento do aluno não foi salvo na última vez (RA → motivo). */
  readonly falhas = this.alunosService.falhas;
  /** O aluno da origem com os dados abertos embaixo da linha (um por vez); null = nenhum. */
  readonly detalheAberto = signal<string | null>(null);
  /** Arraste em curso: de que lado saiu e quais alunos vão (o arrastado, ou todos os marcados do lado se ele estiver marcado). */
  readonly arrasto = signal<{ de: Lado; ras: readonly string[] } | null>(null);
  /** O lado sobre o qual o arraste está: ganha o destaque de "solte aqui". */
  readonly alvoDoArrasto = signal<Lado | null>(null);

  readonly anoLetivo = this.salasService.anoLetivo;
  /** O ano escolhido ainda não chegou: as salas e turmas seriam as do ano anterior. */
  readonly carregandoSalas = computed(() => this.salasService.anoCarregado() !== this.anoLetivo());

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

  /** Os alunos da unidade no ano: carregando, prontos ou com erro. */
  readonly estadoAlunos = computed(() => {
    const filial = this.codFilial();
    if (filial === null || this.carregandoSalas()) return null;
    return this.alunosService.estado(this.anoLetivo(), filial) ?? { estado: 'carregando' as const };
  });

  /**
   * Quanto a leitura dos alunos costuma levar, pelo tamanho da unidade: a consulta traz a foto de
   * cada aluno (CASJ I, ~1.400 alunos: ~15 s; CAMENDEL, ~4.800: ~54 s). Lida há pouco, o back
   * responde na hora e a barra só passa.
   */
  readonly estimativaLeitura = computed(() => {
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

  /** As turmas do cadastro da unidade no ano, que são o destino: carregando, prontas ou com erro. */
  readonly estadoTurmas = computed(() => {
    const filial = this.codFilial();
    if (filial === null || this.carregandoSalas()) return null;
    return this.alunosService.turmas(this.anoLetivo(), filial) ?? { estado: 'carregando' as const };
  });

  /** Os alunos e as turmas da unidade chegaram: dá para escolher a série e montar os dois lados. */
  readonly prontos = computed(() => this.estadoAlunos()?.estado === 'pronto' && this.estadoTurmas()?.estado === 'pronto');

  /** O que não deu para ler da unidade no RM; null = nada falhou. */
  readonly erroDeLeitura = computed(() => {
    const alunos = this.estadoAlunos()?.estado === 'erro';
    const turmas = this.estadoTurmas()?.estado === 'erro';
    if (alunos && turmas) return 'Não foi possível ler os alunos e as turmas da unidade no RM.';
    if (alunos) return 'Não foi possível ler os alunos da unidade no RM.';
    return turmas ? 'Não foi possível ler as turmas da unidade no RM.' : null;
  });

  private readonly turmasDaUnidade = computed<readonly ApiTurmaEnturmacaoDto[]>(() => {
    const estado = this.estadoTurmas();
    return estado?.estado === 'pronto' ? estado.turmas : [];
  });

  /** Os movimentos já gravados no RM e ainda não importados: carregando, prontos ou com erro. */
  readonly estadoPendentes = computed(() => {
    const filial = this.codFilial();
    if (filial === null || this.carregandoSalas()) return null;
    return this.alunosService.pendentes(this.anoLetivo(), filial) ?? { estado: 'carregando' as const };
  });

  private readonly gravadosNoRm = computed<ReadonlyMap<string, string>>(() => {
    const estado = this.estadoPendentes();
    return estado?.estado === 'pronto' ? estado.porRa : new Map();
  });

  private readonly alunosDaUnidade = computed<AlunoDaTela[]>(() => {
    const estado = this.estadoAlunos();
    if (estado?.estado !== 'pronto') return [];
    const gravados = this.gravadosNoRm();
    return estado.alunos.map((dto) => paraTela(dto, gravados.get(dto.ra))).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  /** As séries da unidade, na ordem da consulta (por curso e habilitação). */
  readonly series = computed<SerieDaUnidade[]>(() => {
    const estado = this.estadoAlunos();
    if (estado?.estado !== 'pronto') return [];
    const mapa = new Map<string, SerieDaUnidade>();
    estado.alunos.forEach((dto) => {
      const chave = chaveDaSerie(dto);
      const atual = mapa.get(chave);
      if (atual) atual.qtd++;
      else mapa.set(chave, { chave, rotulo: rotuloDaSerie(dto.serie), qtd: 1 });
    });
    return [...mapa.values()];
  });

  readonly serieOptions = computed<SelectOption[]>(() => {
    if (!this.prontos()) return [{ value: '', label: this.codFilial() === null ? 'Escolha a unidade antes' : 'Carregando...' }];
    return [
      { value: '', label: 'Selecione a série' },
      ...this.series().map((s) => ({ value: s.chave, label: `${s.rotulo} (${s.qtd})` })),
    ];
  });

  private readonly chaveMovimentos = computed(() => `${this.anoLetivo()}|${this.codFilial()}`);
  private readonly movidos = computed(() => this.movimentos().get(this.chaveMovimentos()) ?? new Map<string, string>());

  /** Turma em que o aluno está agora na tela: a de destino, se foi movido; senão a do RM. */
  private turmaAtual(aluno: AlunoDaTela): string {
    return this.movidos().get(aluno.id) ?? aluno.codTurmaOriginal ?? SEM_TURMA;
  }

  /** Sala e turno de cada turma da unidade (as que estão vinculadas a uma sala). */
  private readonly salaPorTurma = computed(() => {
    const filial = this.codFilial();
    const mapa = new Map<string, { sala: SalaDaTurma; nome: string }>();
    this.salasService
      .salas()
      .filter((s) => s.codFilial === filial)
      .forEach((s) =>
        (['manha', 'tarde'] as const).forEach((turno) => {
          const turmas = s.turnos[turno] ?? [];
          const sala: SalaDaTurma = {
            id: s.id,
            nome: s.nome,
            andar: nomeDoAndar(s.andar),
            carteiras: s.carteiras,
            turno,
            codFilial: s.codFilial,
            turmasNoTurno: turmas.map((t) => t.codTurma),
          };
          turmas.forEach((t) => mapa.set(t.codTurma, { sala, nome: t.nome }));
        }),
      );
    return mapa;
  });

  /**
   * As turmas da série, para o destino: as do cadastro da unidade no ano (OC_SAL_ENTUR_TURMAS), com
   * ou sem sala e com ou sem aluno; as subturmas (Integral, Semi) entram como turmas próprias. A série
   * da turma é a do curso e habilitação, se o cadastro trouxer; senão, a do nome ("3º Ano A - Manhã" é
   * do 3º Ano). A sala e as carteiras vêm das salas do ano, pelo código da turma.
   */
  readonly turmasDaSerie = computed<TurmaDaSerie[]>(() => {
    const serie = this.serie();
    if (!serie || this.codFilial() === null) return [];
    const [codCurso, codHabilitacao] = serie.split('|');
    const nomeDaSerie = serieDaTurma(this.series().find((s) => s.chave === serie)?.rotulo ?? '');
    const salas = this.salaPorTurma();
    const ehDaSerie = (t: ApiTurmaEnturmacaoDto) =>
      t.codCurso && t.codHabilitacao
        ? mesmoCodigo(t.codCurso, codCurso) && mesmoCodigo(t.codHabilitacao, codHabilitacao)
        : serieDaTurma(t.nome) === nomeDaSerie;
    const daTurma = (codTurma: string, nome: string, turno: string): TurmaDaSerie => {
      const naSala = salas.get(codTurma);
      return { id: codTurma, nome, turno: naSala ? ROTULO_TURNO[naSala.sala.turno] : turno, sala: naSala?.sala ?? null };
    };

    const turmas = new Map<string, TurmaDaSerie>();
    this.turmasDaUnidade()
      .filter(ehDaSerie)
      .forEach((t) => turmas.set(t.codTurma, daTurma(t.codTurma, t.nome, t.turno ?? rotuloDoPeriodo(sufixoDaTurma(t.codTurma)))));
    // Aluno numa turma que o cadastro não trouxe (não deveria acontecer): ela entra, senão ele sumiria da tela.
    this.alunosDaUnidade().forEach((a) => {
      const cod = a.codTurmaOriginal;
      if (a.serie === serie && cod && !turmas.has(cod)) turmas.set(cod, daTurma(cod, salas.get(cod)?.nome ?? cod, ''));
    });
    return [...turmas.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  });

  /** As turmas da série para o campo de destino: o nome e quantos alunos tem agora. */
  readonly turmaOptions = computed<SelectOption[]>(() =>
    this.turmasDaSerie().map((t) => ({ value: t.id, label: `${t.nome} (${this.alunosNaTurma(t.id).length})` })),
  );

  /**
   * A origem é por período: "4º Ano - Manhã" junta os alunos da série desse período que estão sem
   * turma. Em 2027, o ano em que a tela vai ser usada, os alunos chegam sem turma, e o período de
   * cada um vem da série dele no RM. Entram os períodos que têm aluno na série, na ordem do dia.
   */
  readonly periodosDaSerie = computed<TurmaDaSerie[]>(() => {
    const serie = this.serie();
    if (!serie) return [];
    const presentes = new Set(this.alunosDaUnidade().filter((a) => a.serie === serie).map((a) => a.periodo));
    const nomeDaSerie = (this.series().find((s) => s.chave === serie)?.rotulo ?? '').split(' - ')[0];
    return PERIODOS.filter((p) => presentes.has(p.chave)).map((p) => ({
      id: idDoPeriodo(p.chave),
      nome: `${nomeDaSerie} - ${p.rotulo}`,
      turno: p.rotulo,
      sala: null,
    }));
  });

  /** Os períodos para o campo de origem, só com o nome. */
  readonly turmaOptionsOrigem = computed<SelectOption[]>(() =>
    this.periodosDaSerie().map((p) => ({ value: p.id, label: p.nome })),
  );

  /** Alunos da unidade (todas as séries) por turma em que estão agora: a lotação conta todos. */
  private readonly alunosPorTurma = computed(() => {
    const recentes = this.recemMovidos();
    const mapa = new Map<string, AlunoDaTela[]>();
    this.alunosDaUnidade().forEach((a) => {
      const turma = this.turmaAtual(a);
      const lista = mapa.get(turma);
      if (lista) lista.push(a);
      else mapa.set(turma, [a]);
    });
    mapa.forEach((lista) => lista.sort((a, b) => Number(recentes.has(b.id)) - Number(recentes.has(a.id))));
    return mapa;
  });

  /** Os alunos de uma turma do destino ou, para um período da origem, os sem turma da série nele. */
  private alunosNaTurma(id: string): AlunoDaTela[] {
    const periodo = chaveDoPeriodo(id);
    const todos = this.alunosPorTurma().get(periodo !== null ? SEM_TURMA : id) ?? [];
    // "Sem turma" reúne todas as séries e períodos: aqui, só os da série da tela (e do período).
    if (periodo !== null) return todos.filter((a) => a.serie === this.serie() && a.periodo === periodo);
    return id === SEM_TURMA ? todos.filter((a) => a.serie === this.serie()) : todos;
  }

  /** A busca de cada lado, por nome (sem ligar para acento) ou RA. Volta a vazia ao trocar a série. */
  readonly busca = signal<Readonly<Record<Lado, string>>>({ origem: '', destino: '' });

  /** Cada lado sempre em ordem alfabética: de A a Z, ou de Z a A depois de um clique no botão de ordem. */
  readonly ordem =signal<Readonly<Record<Lado, OrdemDosNomes>>>({ origem: 'az', destino: 'az' });

  readonly origem = computed(() => this.painel('origem'));
  readonly destino = computed(() => this.painel('destino'));

  readonly qtdMarcadosOrigem = computed(() => this.marcadosOrigem().size);
  readonly qtdMarcadosDestino = computed(() => this.marcadosDestino().size);

  /** Há marcados dos dois lados: o ⇄ troca os alunos (os da origem entram na turma; os da turma voltam para a origem). */
  readonly podeTrocar = computed(
    () => this.qtdMarcadosOrigem() > 0 && this.qtdMarcadosDestino() > 0 && !!this.origemId() && !!this.destinoId(),
  );

  /** Os movimentos da unidade que ainda não foram salvos, com o motivo se a última gravação falhou. */
  readonly pendentes = computed(() => {
    const movidos = this.movidos();
    const falhas = this.falhas();
    const porRa = new Map(this.alunosDaUnidade().map((a) => [a.id, a]));
    return [...movidos].flatMap(([ra, para]) => {
      const aluno = porRa.get(ra);
      if (!aluno) return [];
      return [
        {
          aluno,
          de: this.nomeDaTurma(aluno.codTurmaOriginal ?? SEM_TURMA),
          para: this.nomeDaTurma(para),
          paraId: para,
          falha: falhas.get(ra) ?? null,
        },
      ];
    });
  });

  /** Dá para salvar: há movimentos, nenhuma gravação em curso e os já gravados foram lidos. */
  readonly podeSalvar = computed(
    () => this.pendentes().length > 0 && this.salvando() === 0 && this.estadoPendentes()?.estado === 'pronto',
  );

  /** A barra de espera: as salas do ano, os alunos da unidade ou a gravação no RM. */
  readonly espera = computed<{ ativo: boolean; texto: string; estimativaMs: number | null }>(() => {
    if (this.carregandoSalas()) return { ativo: true, texto: 'Carregando as turmas do ano...', estimativaMs: null };
    const salvando = this.salvando();
    if (salvando > 0) {
      // Cada aluno é uma leitura e uma gravação no MD (~1 s); se os alunos do back venceram, ele relê a unidade.
      const texto = salvando === 1 ? 'Salvando 1 movimento...' : `Salvando ${salvando} movimentos...`;
      return { ativo: true, texto, estimativaMs: 2000 + salvando * 1200 };
    }
    if (this.estadoAlunos()?.estado === 'carregando') {
      return { ativo: true, texto: 'Lendo os alunos da unidade no RM...', estimativaMs: this.estimativaLeitura() };
    }
    // As turmas vêm em menos de 1 s: quase sempre chegam antes dos alunos.
    return { ativo: this.estadoTurmas()?.estado === 'carregando', texto: 'Lendo as turmas da unidade no RM...', estimativaMs: 1500 };
  });

  constructor() {
    // A escolha fica guardada para quando a tela for recriada.
    effect(() => {
      this.alunosService.selecao = {
        ano: this.anoLetivo(),
        codFilial: this.codFilial(),
        serie: this.serie(),
        origemId: this.origemId(),
        destinoId: this.destinoId(),
      };
    });
    // A unidade escolhida pede os alunos dela (a leitura é lenta: só a da unidade em uso).
    effect(() => {
      const filial = this.codFilial();
      const ano = this.anoLetivo();
      if (filial !== null && !this.carregandoSalas()) untracked(() => this.alunosService.garantir(ano, filial));
    });
    // As fotos dos alunos dos dois lados (só as que ainda não vieram; a tela não espera por elas).
    effect(() => {
      const filial = this.codFilial();
      const ras = [this.origem(), this.destino()].flatMap((p) => p?.alunos.map((a) => a.id) ?? []);
      const ano = this.anoLetivo();
      if (filial !== null && ras.length > 0) untracked(() => this.alunosService.fotosPara(ano, filial, ras));
    });
  }

  /** A foto do aluno (data URL) ou null: sem ela, o cartão mostra as iniciais. */
  foto(aluno: AlunoDaTela): string | null {
    const filial = this.codFilial();
    return filial === null ? null : this.alunosService.foto(this.anoLetivo(), filial, aluno.id);
  }

  /** O nome do cartão: o primeiro e o segundo nome (com "da", "de"... junto); o completo fica na dica. */
  doisNomes(nome: string): string {
    const partes = nome.trim().split(/\s+/);
    if (partes.length <= 2) return partes.join(' ');
    const [primeiro, segundo, terceiro] = partes;
    return PARTICULAS.has(segundo.toLowerCase()) ? `${primeiro} ${segundo} ${terceiro}` : `${primeiro} ${segundo}`;
  }

  iniciais(nome: string): string {
    const partes = nome.split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
  }

  /**
   * A foto ampliada, ao lado da miniatura que a abriu: de qual aluno, de que lado e o elemento em que
   * ela se ancora. Fecha com Esc, com um clique fora, ao começar um arraste ou quando o aluno sai do lado.
   */
  readonly previa = signal<{ lado: Lado; ra: string; origem: HTMLElement } | null>(null);

  /** O aluno da foto ampliada, enquanto ele continuar no lado em que ela foi aberta. */
  readonly alunoDaPrevia = computed(() => {
    const p = this.previa();
    if (!p) return null;
    return (p.lado === 'origem' ? this.origem() : this.destino())?.alunos.find((a) => a.id === p.ra) ?? null;
  });

  /** À direita da miniatura; sem espaço, à esquerda; por último, embaixo. */
  readonly posicoesDaPrevia: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 12 },
    { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -12 },
    { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
  ];

  /** Abre a foto grande do aluno; se já for a dele, fecha. */
  alternarPrevia(lado: Lado, aluno: AlunoDaTela, event: Event): void {
    event.stopPropagation();
    const origem = event.currentTarget as HTMLElement;
    this.previa.update((p) => (p?.ra === aluno.id && p.lado === lado ? null : { lado, ra: aluno.id, origem }));
  }

  /** A foto grande deste aluno está aberta? */
  previaAberta(lado: Lado, ra: string): boolean {
    const p = this.previa();
    return p?.lado === lado && p.ra === ra;
  }

  /** Clique fora da foto grande: fecha, menos na miniatura que a abriu (o clique dela já fecha). */
  cliqueForaDaPrevia(event: MouseEvent): void {
    const p = this.previa();
    if (p && !p.origem.contains(event.target as Node)) this.previa.set(null);
  }

  /** Esc fecha a foto grande. */
  teclaNaPrevia(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.fecharPrevia();
  }

  /** Fecha a foto grande e devolve o foco à miniatura. */
  fecharPrevia(): void {
    const p = this.previa();
    this.previa.set(null);
    p?.origem.focus();
  }

  /** O que aparece abaixo do nome: o RA e de onde o aluno veio. */
  descricao(aluno: AlunoDaTela): string {
    if (aluno.novo) return `RA ${aluno.id} · aluno novo`;
    return aluno.turmaAnterior ? `RA ${aluno.id} · antes ${aluno.turmaAnterior}` : `RA ${aluno.id}`;
  }

  /** Movido nesta tela: de qual turma veio (null = está na turma do RM). */
  veioDe(aluno: AlunoDaTela): string | null {
    return this.movidos().has(aluno.id) ? this.nomeCurto(aluno.codTurmaOriginal ?? SEM_TURMA) : null;
  }

  /** A última tentativa de salvar o movimento deste aluno falhou: o motivo (null = não falhou). */
  falhaDe(aluno: AlunoDaTela): string | null {
    return this.falhas().get(aluno.id) ?? null;
  }

  /**
   * Gravado no RM e ainda não importado (e não mexido de novo nesta tela): a dica da etiqueta
   * "gravado", com a turma da matrícula. null = sem etiqueta.
   */
  gravado(aluno: AlunoDaTela): string | null {
    if (!aluno.gravadoNoRm || this.movidos().has(aluno.id)) return null;
    return `Movimento salvo, falta importar para a matrícula (hoje em ${this.nomeCurto(aluno.codTurmaMatricula ?? SEM_TURMA)}).`;
  }

  /** Abre os dados do aluno embaixo da linha dele (fecha o que estava aberto); clicar de novo fecha. */
  alternarDetalhe(ra: string): void {
    this.detalheAberto.update((aberto) => (aberto === ra ? null : ra));
  }

  /**
   * A faixa do cartão da origem: a série (o ano em destaque e o nível em letra menor; sem o turno, que
   * vai no período), o período e a data da matrícula. Novo ou veterano vai num selo ao lado do nome. A
   * turma não entra: na origem o aluno não tem turma. A observação, quando há, vem embaixo da faixa.
   */
  resumo(aluno: AlunoDaTela): DadoDoAluno[] {
    const [ano, ...nivel] = rotuloDaSerie(aluno.serieNome).split(' - ');
    const icone = ICONE_DO_PERIODO[aluno.periodo];
    return [
      { rotulo: 'Série', valor: ano, ...(nivel.length > 0 ? { complemento: nivel.join(' - ') } : {}) },
      { rotulo: 'Período', valor: rotuloDoPeriodo(aluno.periodo), ...(icone ? { icone } : {}) },
      { rotulo: 'Matrícula', valor: aluno.dataMatricula ?? '—' },
    ];
  }

  /**
   * O resto, no detalhe que abre embaixo do cartão da origem: o que o cartão não mostra. O que o RM
   * não tem fica de fora; sem nada, o cartão não abre.
   */
  detalhes(aluno: AlunoDaTela): DadoDoAluno[] {
    const movidoPara = this.movidos().get(aluno.id);
    const anoAnterior = [aluno.serieAnterior, aluno.turmaAnterior].filter(Boolean).join(' · ');
    const dados: (DadoDoAluno | null)[] = [
      aluno.gravadoNoRm ? { rotulo: 'Salvo para', valor: this.nomeDaTurma(aluno.codTurmaOriginal ?? SEM_TURMA) } : null,
      movidoPara
        ? {
            rotulo: 'Nesta tela',
            valor: `movido de ${this.nomeDaTurma(aluno.codTurmaOriginal ?? SEM_TURMA)} para ${this.nomeDaTurma(movidoPara)}, falta salvar`,
          }
        : null,
      this.falhaDe(aluno) ? { rotulo: 'Não salvou', valor: this.falhaDe(aluno)! } : null,
      anoAnterior ? { rotulo: 'Ano anterior', valor: anoAnterior } : null,
      aluno.instituicaoOrigem ? { rotulo: 'Escola de origem', valor: aluno.instituicaoOrigem } : null,
    ];
    return dados.filter((d): d is DadoDoAluno => d !== null);
  }

  /** A segunda linha do cartão: de onde o aluno veio. */
  anterior(aluno: AlunoDaTela): string {
    if (aluno.novo) return 'aluno novo';
    return aluno.turmaAnterior ? `antes ${aluno.turmaAnterior}` : '';
  }

  /**
   * Começa a arrastar um aluno. Se ele estiver marcado, vão todos os marcados do lado (a imagem do
   * arraste diz quantos); senão, só ele. Durante a gravação no RM não se arrasta.
   */
  iniciarArrasto(lado: Lado, ra: string, event: DragEvent): void {
    this.previa.set(null);
    if (this.salvando() > 0) {
      event.preventDefault();
      return;
    }
    const marcados = lado === 'origem' ? this.marcadosOrigem() : this.marcadosDestino();
    const ras = marcados.has(ra) ? [...marcados] : [ra];
    this.arrasto.set({ de: lado, ras });
    const dados = event.dataTransfer;
    if (!dados) return;
    dados.effectAllowed = 'move';
    dados.setData('text/plain', ras.join(','));
    if (ras.length > 1) definirImagemDoArrasto(dados, qtdAlunos(ras.length));
  }

  /** Sobre o outro lado, aceita soltar (sem preventDefault o navegador não deixa). */
  arrastarSobre(lado: Lado, event: DragEvent): void {
    const arrasto = this.arrasto();
    if (!arrasto || arrasto.de === lado) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.alvoDoArrasto.set(lado);
  }

  /**
   * O dragleave também dispara ao passar de um cartão para outro dentro do lado (e o Chrome nem
   * sempre diz para onde foi): só sai se o ponteiro deixou a área do lado.
   */
  sairDoArrasto(lado: Lado, event: DragEvent): void {
    const lugar = event.currentTarget as HTMLElement | null;
    if (lugar && event.relatedTarget instanceof Node && lugar.contains(event.relatedTarget)) return;
    const area = lugar?.getBoundingClientRect();
    const { clientX: x, clientY: y } = event;
    if (area && x > area.left && x < area.right && y > area.top && y < area.bottom) return;
    if (this.alvoDoArrasto() === lado) this.alvoDoArrasto.set(null);
  }

  /** Soltar do outro lado move os alunos arrastados para a turma deste lado. */
  soltar(lado: Lado, event: DragEvent): void {
    event.preventDefault();
    const arrasto = this.arrasto();
    this.terminarArrasto();
    const para = lado === 'origem' ? this.origemId() : this.destinoId();
    if (!arrasto || arrasto.de === lado || !para) return;
    this.mover([...arrasto.ras], para);
  }

  terminarArrasto(): void {
    this.arrasto.set(null);
    this.alvoDoArrasto.set(null);
  }

  /** O cartão está indo junto no arraste em curso (fica apagado). */
  arrastando(ra: string): boolean {
    return this.arrasto()?.ras.includes(ra) ?? false;
  }

  marcado(lado: Lado, ra: string): boolean {
    return (lado === 'origem' ? this.marcadosOrigem() : this.marcadosDestino()).has(ra);
  }

  /** Trocar o ano troca o de todas as telas (é o do SalasService). Os movimentos ficam guardados por ano. */
  selecionarAno(ano: string): void {
    this.codFilial.set(null);
    this.limparSerie();
    this.salasService.selecionarAno(ano);
  }

  selecionarUnidade(valor: string): void {
    this.codFilial.set(valor ? Number(valor) : null);
    this.limparSerie();
  }

  /**
   * A série nova abre, na origem, com o primeiro período que tem aluno sem turma (senão o primeiro) e,
   * no destino, com a primeira turma principal desse período: sem as subturmas Integral e Semi, que
   * vêm antes na ordem do nome. Sem turma do período, a primeira principal; sem principal, a primeira.
   */
  selecionarSerie(chave: string): void {
    this.serie.set(chave);
    this.limparMarcados();
    this.busca.set({ origem: '', destino: '' });
    const periodos = this.periodosDaSerie();
    const origem = periodos.find((p) => this.alunosNaTurma(p.id).length > 0) ?? periodos[0];
    const turmas = this.turmasDaSerie();
    const principais = turmas.filter((t) => !/integral|semi/i.test(t.nome));
    const doPeriodo = principais.find((t) => sufixoDaTurma(t.id) === chaveDoPeriodo(origem?.id ?? ''));
    const destino = doPeriodo ?? principais[0] ?? turmas[0];
    this.origemId.set(origem?.id ?? null);
    this.destinoId.set(destino?.id ?? null);
  }

  /** Escolhe o período da origem ou a turma do destino. */
  escolherTurma(lado: Lado, id: string): void {
    const campo = lado === 'origem' ? this.origemId : this.destinoId;
    if (campo() === id) return;
    campo.set(id);
    this.limparMarcados();
  }

  /** O botão ⇄: com marcados dos dois lados, troca os alunos. */
  trocar(): void {
    if (this.podeTrocar()) this.trocarMarcados();
  }

  /** O que o botão de mover do trilho faz, na dica e para o leitor de tela: quantos e para qual turma. */
  rotuloMover(de: Lado): string {
    const qtd = de === 'origem' ? this.qtdMarcadosOrigem() : this.qtdMarcadosDestino();
    if (qtd === 0) return de === 'origem' ? 'Marque alunos na origem para mover' : 'Marque alunos no destino para mover';
    const para = de === 'origem' ? this.destinoId() : this.origemId();
    return `Mover ${qtd} para ${para ? this.nomeDaTurma(para) : 'o outro lado'}`;
  }

  /** O que o ⇄ do trilho faz: quantos vão de cada lado. */
  rotuloTrocar(): string {
    return this.podeTrocar()
      ? `Trocar ${this.qtdMarcadosOrigem()} da origem por ${this.qtdMarcadosDestino()} do destino`
      : 'Marque alunos dos dois lados para trocar';
  }

  buscar(lado: Lado, texto: string): void {
    this.busca.update((b) => ({ ...b, [lado]: texto }));
  }

  /** A busca do lado, como foi digitada (para o campo). */
  buscaDe(lado: Lado): string {
    return this.busca()[lado];
  }

  /** A ordem dos nomes do lado: de A a Z ou de Z a A. */
  ordemDe(lado: Lado): OrdemDosNomes {
    return this.ordem()[lado];
  }

  /**
   * A caixa de marcar todos: marcada com todos os que a lista mostra marcados, parcial com só alguns
   * deles, vazia com nenhum (o valor vai direto no aria-checked).
   */
  estadoMarcarTodos(lado: Lado): 'true' | 'false' | 'mixed' {
    const painel = lado === 'origem' ? this.origem() : this.destino();
    const marcados = lado === 'origem' ? this.marcadosOrigem() : this.marcadosDestino();
    const qtd = painel?.visiveis.filter((a) => marcados.has(a.id)).length ?? 0;
    if (qtd === 0) return 'false';
    return qtd === painel!.visiveis.length ? 'true' : 'mixed';
  }

  /** O botão de ordem: inverte o lado entre A a Z e Z a A. */
  alternarOrdem(lado: Lado): void {
    this.ordem.update((o) => ({ ...o, [lado]: o[lado] === 'az' ? 'za' : 'az' }));
  }

  /**
   * Os marcados da origem entram na turma do destino e os marcados da turma voltam para a origem (sem
   * turma), de uma vez.
   */
  trocarMarcados(): void {
    const origem = this.origemId();
    const destino = this.destinoId();
    if (!origem || !destino) return;
    const movidos = this.aplicarMovimentos([
      { ras: [...this.marcadosOrigem()], para: destino },
      { ras: [...this.marcadosDestino()], para: origem },
    ]);
    if (movidos.length === 0) return;
    const titulo = `${qtdAlunos(movidos.length)} ${movidos.length === 1 ? 'trocado' : 'trocados'} entre ${this.nomeDaTurma(origem)} e ${this.nomeDaTurma(destino)}`;
    this.avisarMovimento(titulo, [origem, destino]);
  }

  tentarDeNovo(): void {
    const filial = this.codFilial();
    if (filial !== null) this.alunosService.garantir(this.anoLetivo(), filial);
  }

  alternarAluno(lado: Lado, ra: string): void {
    const marcados = lado === 'origem' ? this.marcadosOrigem : this.marcadosDestino;
    marcados.update((atual) => {
      const proximos = new Set(atual);
      if (proximos.has(ra)) proximos.delete(ra);
      else proximos.add(ra);
      return proximos;
    });
  }

  /** O checkbox da linha da origem: marca ou desmarca o aluno, conforme o que ele mostra. */
  definirMarcado(lado: Lado, ra: string, marcar: boolean): void {
    if (this.marcado(lado, ra) !== marcar) this.alternarAluno(lado, ra);
  }

  /**
   * Marca todos os que a lista mostra (com busca, só os encontrados; os marcados antes continuam);
   * com todos eles já marcados, desmarca esses.
   */
  alternarTodos(lado: Lado): void {
    const painel = lado === 'origem' ? this.origem() : this.destino();
    if (!painel) return;
    const marcados = lado === 'origem' ? this.marcadosOrigem : this.marcadosDestino;
    const desmarcar = this.todosMarcados(lado);
    marcados.update((atual) => {
      const proximos = new Set(atual);
      painel.visiveis.forEach((a) => (desmarcar ? proximos.delete(a.id) : proximos.add(a.id)));
      return proximos;
    });
  }

  /** Todos os que a lista mostra estão marcados. */
  todosMarcados(lado: Lado): boolean {
    const painel = lado === 'origem' ? this.origem() : this.destino();
    const marcados = lado === 'origem' ? this.marcadosOrigem() : this.marcadosDestino();
    return !!painel && painel.visiveis.length > 0 && painel.visiveis.every((a) => marcados.has(a.id));
  }

  /** Leva os marcados de um lado para a turma do outro. */
  moverMarcados(de: Lado): void {
    const para = de === 'origem' ? this.destinoId() : this.origemId();
    const marcados = de === 'origem' ? this.marcadosOrigem() : this.marcadosDestino();
    if (!para || marcados.size === 0) return;
    this.mover([...marcados], para);
  }

  desfazer(ra: string): void {
    this.atualizarMovidos((m) => m.delete(ra));
    this.esquecerFalhas([ra]);
  }

  desfazerTudo(): void {
    this.esquecerFalhas([...this.movidos().keys()]);
    this.atualizarMovidos((m) => m.clear());
    this.recemMovidos.set(new Set());
  }

  /**
   * Grava os movimentos da unidade no MD de enturmação. Os que gravaram deixam de ser pendentes (o
   * aluno fica na turma nova com a etiqueta "salvo"); os que falharam ficam, com a etiqueta "não
   * salvou" e o motivo. "Sem turma" vai com a turma vazia: o back desfaz o movimento que ainda não
   * foi importado (e recusa, dizendo por quê, se o aluno já tem turma na matrícula).
   */
  salvar(): void {
    const filial = this.codFilial();
    if (filial === null || !this.podeSalvar()) return;
    const ano = this.anoLetivo();
    const chave = this.chaveMovimentos();
    const movimentos = this.pendentes().map((m) => ({ ra: m.aluno.id, codTurma: m.paraId === SEM_TURMA ? '' : m.paraId }));

    this.salvando.set(movimentos.length);
    this.alunosService.salvar(ano, filial, movimentos).subscribe({
      next: (resultados) => {
        this.salvando.set(0);
        const gravados = resultados.filter((r) => r.situacao !== 'falhou').map((r) => r.ra);
        const falharam = resultados.filter((r) => r.situacao === 'falhou');
        this.atualizarMovidos((m) => gravados.forEach((ra) => m.delete(ra)), chave);
        this.recemMovidos.set(new Set());
        this.falhas.set(new Map(falharam.map((r): [string, string] => [r.ra, r.motivo ?? 'Não foi possível salvar.'])));
        const qtd = `${gravados.length} ${gravados.length === 1 ? 'movimento salvo' : 'movimentos salvos'}`;
        if (falharam.length === 0) {
          this.toast.success(qtd);
        } else {
          this.toast.warning(
            gravados.length > 0 ? `${qtd}; ${falharam.length} não` : 'Nenhum movimento gravado',
            `${falharam[0].motivo ?? 'Não foi possível salvar.'}${falharam.length > 1 ? ' Os outros estão marcados como "não salvou" nos alunos.' : ''}`,
          );
        }
      },
      error: (erro: unknown) => {
        this.salvando.set(0);
        const mensagem = erro instanceof HttpErrorResponse && erro.status === 400 ? erro.error?.message : null;
        this.toast.danger('Não foi possível salvar', typeof mensagem === 'string' && mensagem ? mensagem : 'Falha de comunicação com o servidor.');
      },
    });
  }

  private limparSerie(): void {
    this.serie.set('');
    this.origemId.set(null);
    this.destinoId.set(null);
    this.limparMarcados();
    this.busca.set({ origem: '', destino: '' });
  }

  private limparMarcados(): void {
    this.marcadosOrigem.set(new Set());
    this.marcadosDestino.set(new Set());
    this.recemMovidos.set(new Set());
  }

  private esquecerFalhas(ras: readonly string[]): void {
    if (!ras.some((ra) => this.falhas().has(ra))) return;
    this.falhas.update((atual) => {
      const proximas = new Map(atual);
      ras.forEach((ra) => proximas.delete(ra));
      return proximas;
    });
  }

  private atualizarMovidos(mudar: (m: Map<string, string>) => void, chave = this.chaveMovimentos()): void {
    this.movimentos.update((todos) => {
      const daUnidade = new Map(todos.get(chave) ?? []);
      mudar(daUnidade);
      return new Map(todos).set(chave, daUnidade);
    });
  }

  private mover(ras: string[], destinoId: string): void {
    const movidos = this.aplicarMovimentos([{ ras, para: destinoId }]);
    if (movidos.length === 0) return;
    const titulo =
      paraTurma(destinoId) === SEM_TURMA
        ? `${qtdAlunos(movidos.length)} ${movidos.length === 1 ? 'tirado' : 'tirados'} da turma`
        : `${qtdAlunos(movidos.length)} ${movidos.length === 1 ? 'movido' : 'movidos'} para ${this.nomeDaTurma(destinoId)}`;
    this.avisarMovimento(titulo, [destinoId]);
  }

  /**
   * Leva cada grupo de alunos para a sua turma, todos de uma vez: a turma de onde cada um sai é a de
   * antes de qualquer movimento (numa troca, um não atrapalha o outro). Ir para um período da origem é
   * ficar sem turma. Devolve os que mudaram de turma.
   */
  private aplicarMovimentos(grupos: readonly { ras: readonly string[]; para: string }[]): AlunoDaTela[] {
    const porRa = new Map(this.alunosDaUnidade().map((a) => [a.id, a]));
    const chegando = grupos.flatMap(({ ras, para: destino }) => {
      const para = paraTurma(destino);
      return ras.flatMap((ra) => {
        const aluno = porRa.get(ra);
        return aluno && this.turmaAtual(aluno) !== para ? [{ aluno, para }] : [];
      });
    });
    this.limparMarcados();
    if (chegando.length === 0) return [];
    this.atualizarMovidos((m) =>
      chegando.forEach(({ aluno, para }) => {
        // Voltar para a turma do RM não é movimento: sai da lista.
        if (para === (aluno.codTurmaOriginal ?? SEM_TURMA)) m.delete(aluno.id);
        else m.set(aluno.id, para);
      }),
    );
    const ras = chegando.map(({ aluno }) => aluno.id);
    this.esquecerFalhas(ras);
    this.recemMovidos.set(new Set(ras));
    return chegando.map(({ aluno }) => aluno);
  }

  /** O aviso do movimento: alerta se a sala de alguma das turmas passou das carteiras. */
  private avisarMovimento(titulo: string, turmas: readonly string[]): void {
    const passou = turmas
      .map((id) => this.turmasDaSerie().find((t) => t.id === id))
      .map((turma) => (turma ? { turma, lotacao: this.lotacao(turma, 0) } : null))
      .find((x) => !!x?.lotacao && x.lotacao.alunos > x.lotacao.carteiras);
    if (passou?.lotacao) {
      const sala = turmas.length > 1 ? `A ${passou.turma.sala?.nome ?? 'sala'}` : 'A sala';
      this.toast.warning(titulo, `${sala} passou das carteiras: ${passou.lotacao.alunos} alunos para ${passou.lotacao.carteiras}.`);
    } else {
      this.toast.success(titulo, 'Falta salvar: recarregar a página antes desfaz.');
    }
  }

  private painel(lado: Lado): PainelDaTurma | null {
    const id = lado === 'origem' ? this.origemId() : this.destinoId();
    const turma = (lado === 'origem' ? this.periodosDaSerie() : this.turmasDaSerie()).find((t) => t.id === id);
    if (!turma || this.estadoAlunos()?.estado !== 'pronto') return null;
    // Os marcados do outro lado são os que podem vir para cá.
    const vindo = lado === 'origem' ? this.marcadosDestino().size : this.marcadosOrigem().size;
    const alunos = this.alunosNaTurma(turma.id);
    const busca = this.busca()[lado].trim();
    return {
      lado,
      turma,
      alunos,
      visiveis: filtrarEOrdenar(alunos, busca, this.ordem()[lado]),
      busca,
      lotacao: this.lotacao(turma, vindo),
      marcados: lado === 'origem' ? this.marcadosOrigem().size : this.marcadosDestino().size,
    };
  }

  /** A sala da turma no turno dela: todas as turmas do turno somam contra as carteiras. */
  private lotacao(turma: TurmaDaSerie, vindo: number): Lotacao | null {
    const sala = turma.sala;
    if (!sala) return null;
    const alunos = sala.turmasNoTurno.reduce((total, cod) => total + (this.alunosPorTurma().get(cod)?.length ?? 0), 0);
    const previstos = alunos + vindo;
    const limite = (sala.carteiras * this.regras.regrasDaFilial(sala.codFilial).pctMaximoUtilizacao) / 100;
    // Sala sem carteiras cadastradas (comum no ano novo, antes de montar as salas): nem "Disponível"
    // nem selo de vagas; com alunos, é excedida.
    const semCarteiras = sala.carteiras <= 0;
    const faixa = semCarteiras ? (previstos > 0 ? 'excedida' : 'quase') : faixaDe(previstos, sala.carteiras, limite);
    const pct = (n: number) => (sala.carteiras > 0 ? Math.min(100, Math.round((n / sala.carteiras) * 100)) : 100);
    const vagas = sala.carteiras - previstos;
    return {
      alunos,
      carteiras: sala.carteiras,
      previstos,
      faixa,
      rotulo: semCarteiras ? 'Sala sem carteiras cadastradas' : FAIXAS[faixa].rotulo,
      icone: FAIXAS[faixa].icone,
      vagas,
      rotuloVagas: semCarteiras ? '' : rotuloDasVagas(vagas),
      tom: FAIXAS[faixa].tom,
      pct: pct(alunos),
      pctPrevisto: pct(previstos),
      dividemCom: sala.turmasNoTurno.filter((c) => c !== turma.id).map((c) => this.nomeCurto(c)),
    };
  }

  private nomeDaTurma(id: string): string {
    if (id === SEM_TURMA) return 'Sem turma';
    if (chaveDoPeriodo(id) !== null) return this.periodosDaSerie().find((p) => p.id === id)?.nome ?? 'Sem turma';
    return this.turmasDaSerie().find((t) => t.id === id)?.nome ?? this.salaPorTurma().get(id)?.nome ?? id;
  }

  private nomeCurto(id: string): string {
    return id === SEM_TURMA ? 'sem turma' : id;
  }
}

/**
 * Os períodos da origem, na ordem do dia. A chave é o fim do código das turmas do período
 * (EF4A-M, EF4A-SM, EF4A-I, EF4H-T, EF4H-ST); "?" junta quem o RM não diz o período.
 */
const PERIODOS = [
  { chave: 'M', rotulo: 'Manhã' },
  { chave: 'SM', rotulo: 'Semi-Manhã' },
  { chave: 'I', rotulo: 'Integral' },
  { chave: 'T', rotulo: 'Tarde' },
  { chave: 'ST', rotulo: 'Semi-Tarde' },
  { chave: '?', rotulo: 'Sem período' },
] as const;

/** Sem acento e em minúsculas, para "luisa" achar "LUÍSA". */
function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** A ordem dos nomes numa lista: de A a Z ou de Z a A. */
export type OrdemDosNomes = 'az' | 'za';

/**
 * Os alunos que batem com a busca, em ordem alfabética. Cada palavra da busca tem de aparecer no nome
 * (em qualquer parte, sem ligar para acento) ou no RA: "ana mendes" acha "ANA CLARA MENDES".
 */
function filtrarEOrdenar(alunos: AlunoDaTela[], busca: string, ordem: OrdemDosNomes): AlunoDaTela[] {
  const palavras = semAcento(busca).split(/\s+/).filter(Boolean);
  const achados =
    palavras.length === 0
      ? alunos
      : alunos.filter((a) => {
          const nome = semAcento(a.nome);
          return palavras.every((p) => nome.includes(p) || a.id.includes(p));
        });
  const sentido = ordem === 'az' ? 1 : -1;
  return [...achados].sort((a, b) => sentido * a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** O ícone do período na faixa do cartão: o sol para os de dia, o relógio para o integral. */
const ICONE_DO_PERIODO: Readonly<Record<string, string>> = { M: 'wb_sunny', SM: 'wb_sunny', T: 'wb_sunny', ST: 'wb_sunny', I: 'schedule' };

/** O período no cartão do aluno: "Manhã", "Semi-Manhã"...; sem período no RM, "Não informado". */
function rotuloDoPeriodo(chave: string): string {
  return chave === '?' ? 'Não informado' : (PERIODOS.find((p) => p.chave === chave)?.rotulo ?? chave);
}

const PREFIXO_DO_PERIODO = 'periodo:';

const idDoPeriodo = (chave: string) => PREFIXO_DO_PERIODO + chave;

/** A chave do período ("M", "SM"...) de um id da origem; null se o id é de uma turma. */
function chaveDoPeriodo(id: string): string | null {
  return id.startsWith(PREFIXO_DO_PERIODO) ? id.slice(PREFIXO_DO_PERIODO.length) : null;
}

/** Para onde o aluno vai: a turma ou, se for um período da origem, sem turma. */
function paraTurma(id: string): string {
  return chaveDoPeriodo(id) !== null ? SEM_TURMA : id;
}

/** "03" e "3" são o mesmo código de curso ou habilitação (o RM escreve dos dois jeitos). */
function mesmoCodigo(a: string, b: string | undefined): boolean {
  const semZeros = (c: string) => c.trim().replace(/^0+(?=.)/, '');
  return b !== undefined && semZeros(a) === semZeros(b);
}

/** "EF4A-SM" → "SM": o período no fim do código da turma. */
function sufixoDaTurma(codTurma: string): string {
  const i = codTurma.lastIndexOf('-');
  return i >= 0 ? codTurma.slice(i + 1).toUpperCase() : '';
}

/**
 * O período do aluno pela série dele no RM, que tem o turno da habilitação: "4º Ano - Ensino
 * Fundamental - Manhã - EF I", "... - Integral - EFI", "... - Semi Int.M-EFI" (Semi-Manhã), "... -
 * Semi Int.T-EFI" (Semi-Tarde). Sem isso na série, vale o tipo do turno (M, V ou I).
 */
function periodoDoAluno(serie: string, turno: string): string {
  const parte = (serie.split(' - ')[2] ?? '').toLocaleLowerCase('pt-BR');
  const tipo = turno.trim().toUpperCase();
  if (parte.includes('semi')) return /\.t\b|tarde/.test(parte) || tipo === 'V' ? 'ST' : 'SM';
  if (parte.includes('integral')) return 'I';
  if (parte.includes('manh')) return 'M';
  if (parte.includes('tarde')) return 'T';
  return ({ M: 'M', V: 'T', I: 'I' } as Record<string, string>)[tipo] ?? '?';
}

/** As carteiras que sobram na sala; passando delas, quantas faltam. */
function rotuloDasVagas(vagas: number): string {
  if (vagas > 1) return `${vagas} vagas`;
  if (vagas === 1) return '1 vaga';
  if (vagas === 0) return 'Sem vagas';
  return vagas === -1 ? 'Falta 1 carteira' : `Faltam ${-vagas} carteiras`;
}

/**
 * A escolha guardada vale só no mesmo ano: em outro, a série e as turmas seriam outras. Uma origem
 * que não seja período (de antes de a origem ser por período) fica de fora.
 */
function retomar(selecao: SelecaoDaTela | null, ano: string): SelecaoDaTela | null {
  if (selecao?.ano !== ano) return null;
  return selecao.origemId && chaveDoPeriodo(selecao.origemId) === null ? { ...selecao, origemId: null } : selecao;
}

function chaveDaSerie(dto: ApiAlunoEnturmacaoDto): string {
  return `${dto.codCurso}|${dto.codHabilitacao}`;
}

/** "5º Ano - Ensino Fundamental - Manhã - EF I" → "5º Ano - Ensino Fundamental" (o turno sai). */
function rotuloDaSerie(serie: string): string {
  return serie.split(' - ').slice(0, 2).join(' - ') || serie;
}

/** O aluno da consulta, na turma do movimento gravado no RM se houver um (e for outra turma). */
function paraTela(dto: ApiAlunoEnturmacaoDto, gravadoPara: string | undefined): AlunoDaTela {
  const gravadoNoRm = !!gravadoPara && gravadoPara !== dto.codTurma;
  return {
    id: dto.ra,
    nome: dto.nome,
    codTurmaOriginal: gravadoNoRm ? gravadoPara : dto.codTurma,
    codTurmaMatricula: dto.codTurma,
    gravadoNoRm,
    novo: dto.novo,
    turmaAnterior: dto.turmaAnterior,
    serie: chaveDaSerie(dto),
    periodo: periodoDoAluno(dto.serie, dto.turno),
    serieNome: dto.serie,
    serieAnterior: dto.serieAnterior,
    instituicaoOrigem: dto.instituicaoOrigem ?? null,
    dataMatricula: dataCurta(dto.dataMatricula),
    obs: dto.obs?.trim() || null,
  };
}

/** "2025-11-24T00:00:00-03:00" → "24/11/2025"; o que não for data volta como veio. */
function dataCurta(valor: string | null): string | null {
  if (!valor) return null;
  const data = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  return data ? `${data[3]}/${data[2]}/${data[1]}` : valor;
}
