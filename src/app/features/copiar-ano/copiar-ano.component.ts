import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaeaTab, SaeaTabsComponent } from '@sistemas-saea/saea-design-system';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { nomeDoAndar } from '../../core/models';
import {
  ApiCopiaAnoPlanoDto,
  ApiCopiaSalaDto,
  ApiCopiaTurmaDto,
  ApiSituacaoCopiaAno,
} from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { motivoDaFalha, SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { AlertComponent } from '../../shared/ui/alert/alert.component';
import { BadgeComponent, BadgeTone } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

/** Salas por chamada de OC_SAL_COPIAR_ANO_SALAS: a tela mostra o progresso e nenhuma chamada fica longa. */
export const SALAS_POR_LOTE = 10;

/** Situação na tela: as do plano e do resultado, mais as das turmas depois de gravar. */
type Situacao = ApiSituacaoCopiaAno | 'vinculada' | 'movida' | 'liberada';

/** As gravações de turma, na ordem em que são feitas: primeiro as que saem das salas, depois as que entram. */
const ORDEM_DAS_TURMAS = ['liberar', 'mover', 'vincular'] as const;
type GravacaoDeTurma = (typeof ORDEM_DAS_TURMAS)[number];

/** O que a turma vira na tela quando o RM confirma a gravação. */
const GRAVADA: Record<GravacaoDeTurma, Situacao> = { liberar: 'liberada', mover: 'movida', vincular: 'vinculada' };

/**
 * As do plano que ainda vão ser gravadas aparecem no futuro: a tela mostra o plano antes de copiar
 * (e continua mostrando se a cópia não for confirmada).
 */
const SITUACOES: Record<Situacao, { rotulo: string; tom: BadgeTone }> = {
  copiar: { rotulo: 'Vai ser copiada', tom: 'info' },
  atualizar: { rotulo: 'Vai ser atualizada', tom: 'info' },
  'ja-existe': { rotulo: 'Já igual no destino', tom: 'success' },
  'sem-periodo': { rotulo: 'Sem período letivo no destino', tom: 'warning' },
  'periodo-ambiguo': { rotulo: 'Mais de um período no destino', tom: 'warning' },
  vincular: { rotulo: 'Vai para a sala', tom: 'info' },
  mover: { rotulo: 'Vai mudar de sala', tom: 'info' },
  liberar: { rotulo: 'Vai sair da sala', tom: 'info' },
  'ja-vinculada': { rotulo: 'Já estava nessa sala', tom: 'success' },
  'sem-turma': { rotulo: 'Turma não existe no destino', tom: 'warning' },
  criada: { rotulo: 'Copiada', tom: 'success' },
  atualizada: { rotulo: 'Atualizada', tom: 'success' },
  vinculada: { rotulo: 'Colocada na sala', tom: 'success' },
  movida: { rotulo: 'Mudou de sala', tom: 'success' },
  liberada: { rotulo: 'Saiu da sala', tom: 'success' },
  falhou: { rotulo: 'Falhou', tom: 'danger' },
};

/** Ficam de fora da cópia: o destino não tem onde recebê-las. */
const DE_FORA: ReadonlySet<Situacao> = new Set(['sem-periodo', 'periodo-ambiguo', 'sem-turma']);

/** "Sala 2" antes de "Sala 10", sem diferenciar maiúsculas nem acentos. */
const COMPARADOR = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

interface Gravacao {
  situacao: Situacao;
  erro?: string;
}

interface LinhaSala extends ApiCopiaSalaDto {
  andarPorExtenso: string;
  /** O valor que o destino tinha, quando muda com a cópia. */
  carteirasAntes: number | null;
  capacidadeAntes: number | null;
  estado: Situacao;
  erro?: string;
}

interface LinhaTurma extends ApiCopiaTurmaDto {
  chave: string;
  estado: Situacao;
  erro?: string;
}

const chaveDaTurma = (t: Pick<ApiCopiaTurmaDto, 'codFilial' | 'codTurma'>) => `${t.codFilial}|${t.codTurma}`;

/** O valor do destino, se for diferente do da origem (é o que a cópia troca). */
const antes = (noDestino: number | null, naOrigem: number) => (noDestino !== null && noDestino !== naOrigem ? noDestino : null);

/** Quantas linhas estão em cada situação. */
function contar<T extends { estado: Situacao }>(linhas: T[]): (situacao: Situacao) => number {
  const total = new Map<Situacao, number>();
  linhas.forEach((l) => total.set(l.estado, (total.get(l.estado) ?? 0) + 1));
  return (situacao) => total.get(situacao) ?? 0;
}

/** As situações pedidas e as que ficam de fora, com quantas linhas cada; sem as que dão zero. */
function resumo<T extends { estado: Situacao }>(
  linhas: T[],
  itens: [Situacao, string][],
): { quantidade: number; texto: string; tom: BadgeTone }[] {
  const quantas = contar(linhas);
  const deFora = linhas.filter((l) => DE_FORA.has(l.estado)).length;
  return [
    ...itens.map(([situacao, texto]) => ({ quantidade: quantas(situacao), texto, tom: SITUACOES[situacao].tom })),
    { quantidade: deFora, texto: 'ficaram de fora', tom: 'warning' as const },
  ].filter((i) => i.quantidade > 0);
}

/** "3 salas copiadas e 1 sala atualizada": só as partes que não dão zero. */
function listar(partes: [number, string, string][]): string {
  const itens = partes.filter(([n]) => n > 0).map(([n, singular, plural]) => `${n} ${n === 1 ? singular : plural}`);
  return itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}` : (itens[0] ?? '');
}

/** "CASJ (filial 13)" de cada filial com sala na situação, na ordem das filiais. */
function filiaisEm(salas: LinhaSala[], situacao: Situacao): string[] {
  const filiais = new Map<number, string>();
  salas.filter((s) => s.estado === situacao).forEach((s) => filiais.set(s.codFilial, `${s.unidade} (filial ${s.codFilial})`));
  return [...filiais.entries()].sort(([a], [b]) => a - b).map(([, nome]) => nome);
}

/**
 * Copia tudo de um ano letivo para outro (ex.: 2026 → 2027), para o ano seguinte ficar igual ao
 * anterior: o registro de cada sala no PRJ4087040 (todos os campos: carteiras, capacidade e os
 * demais) e cada turma na sala da turma de mesmo código, ou sem sala se na origem ela está sem sala.
 * A tela pede o plano ao backend (OC_SAL_COPIAR_ANO_PLANO, que só lê o RM), mostra o que vai mudar
 * e, confirmado, grava as salas em lotes (OC_SAL_COPIAR_ANO_SALAS) e as turmas uma a uma
 * (OC_SAL_TURMASXSALAS_SALVAR, a mesma gravação da tela Salas → Turmas). O backend só grava o que
 * está diferente no destino, então copiar de novo completa uma cópia interrompida ou acompanha o
 * que mudou depois na origem. Turmas que só existem no destino não são mexidas.
 */
@Component({
  selector: 'app-copiar-ano',
  standalone: true,
  imports: [
    FormsModule,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    SelectComponent,
    SaeaTabsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './copiar-ano.component.html',
  styleUrl: './copiar-ano.component.css',
})
export class CopiarAnoComponent {
  private readonly api = inject(OcupacaoApiService);
  private readonly auth = inject(AuthService);
  private readonly salasService = inject(SalasService);
  private readonly confirmDialog = inject(ConfirmDialogService);
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

  /** O plano da última cópia, com o que aconteceu com cada sala e turma. */
  readonly plano = signal<ApiCopiaAnoPlanoDto | null>(null);
  readonly copiando = signal(false);
  /** A cópia terminou: a tela mostra o resultado de cada linha. */
  readonly copiada = signal(false);
  readonly progresso = signal<{ fase: 'preparando' | 'salas' | 'turmas'; atual: number; total: number } | null>(null);
  readonly aba = signal('salas');

  private readonly gravacaoSalas = signal<Record<string, Gravacao>>({});
  private readonly gravacaoTurmas = signal<Record<string, Gravacao>>({});
  /** Turmas que o RM ainda estava gravando quando a tela parou de esperar. */
  readonly turmasPendentes = signal(0);

  readonly anosValidos = computed(() => !!this.anoOrigem() && !!this.anoDestino() && this.anoOrigem() !== this.anoDestino());
  readonly podeCopiar = computed(() => this.anosValidos() && !this.copiando() && !this.uiMode.readOnlyMode());

  readonly salas = computed<LinhaSala[]>(() => {
    const gravacao = this.gravacaoSalas();
    return (this.plano()?.salas ?? [])
      .map((s) => ({
        ...s,
        andarPorExtenso: nomeDoAndar(s.andar),
        carteirasAntes: antes(s.carteirasNoDestino, s.carteiras),
        capacidadeAntes: antes(s.capacidadeNoDestino, s.capacidade),
        estado: gravacao[s.id]?.situacao ?? s.situacao,
        erro: gravacao[s.id]?.erro,
      }))
      .sort(
        (a, b) =>
          COMPARADOR.compare(a.unidade, b.unidade) ||
          a.codFilial - b.codFilial ||
          COMPARADOR.compare(a.andar, b.andar) ||
          COMPARADOR.compare(a.sala, b.sala),
      );
  });

  readonly turmas = computed<LinhaTurma[]>(() => {
    const gravacao = this.gravacaoTurmas();
    return (this.plano()?.turmas ?? [])
      .map((t) => {
        const chave = chaveDaTurma(t);
        return { ...t, chave, estado: gravacao[chave]?.situacao ?? t.situacao, erro: gravacao[chave]?.erro };
      })
      .sort(
        (a, b) =>
          COMPARADOR.compare(a.unidade, b.unidade) ||
          a.codFilial - b.codFilial ||
          COMPARADOR.compare(a.sala || a.salaNoDestino, b.sala || b.salaNoDestino) ||
          COMPARADOR.compare(a.turma, b.turma),
      );
  });

  readonly contarSalas = computed(() => contar(this.salas()));
  readonly contarTurmas = computed(() => contar(this.turmas()));

  /** Os números do topo do resultado (só os que não são zero). */
  readonly resumoSalas = computed(() =>
    resumo(this.salas(), [
      ['criada', 'copiadas'],
      ['atualizada', 'atualizadas'],
      ['ja-existe', 'já iguais no destino'],
      ['falhou', 'falharam'],
      ['copiar', 'a copiar'],
      ['atualizar', 'a atualizar'],
    ]),
  );
  readonly resumoTurmas = computed(() =>
    resumo(this.turmas(), [
      ['vinculada', 'colocadas nas salas'],
      ['movida', 'mudaram de sala'],
      ['liberada', 'saíram da sala'],
      ['ja-vinculada', 'já estavam na mesma sala'],
      ['falhou', 'falharam'],
      ['vincular', 'vão para a sala'],
      ['mover', 'vão mudar de sala'],
      ['liberar', 'vão sair da sala'],
    ]),
  );

  /**
   * O que ficou de fora e por quê. As filiais vão com o número: no RM várias têm o mesmo nome de
   * unidade (ex.: CASJ é a 2, a 13 e a 16).
   */
  readonly deFora = computed(() => ({
    semPeriodo: filiaisEm(this.salas(), 'sem-periodo'),
    ambiguas: filiaisEm(this.salas(), 'periodo-ambiguo'),
    turmasSemDestino: this.contarTurmas()('sem-turma'),
  }));

  readonly abas = computed<SaeaTab[]>(() => [
    { value: 'salas', label: `Salas (${this.salas().length})`, icon: 'meeting_room' },
    { value: 'turmas', label: `Turmas (${this.turmas().length})`, icon: 'groups' },
  ]);

  readonly situacao = (s: Situacao) => SITUACOES[s];

  escolherOrigem(ano: string): void {
    this.anoOrigem.set(ano);
    this.limpar();
  }

  escolherDestino(ano: string): void {
    this.anoDestino.set(ano);
    this.limpar();
  }

  async copiar(): Promise<void> {
    if (!this.podeCopiar()) return;
    const origem = this.anoOrigem();
    const destino = this.anoDestino();
    const codUsuario = this.codUsuario();
    this.limpar();
    this.copiando.set(true);
    this.progresso.set({ fase: 'preparando', atual: 0, total: 0 });
    try {
      let plano: ApiCopiaAnoPlanoDto;
      try {
        plano = await firstValueFrom(this.api.getPlanoCopiaAno(codUsuario, origem, destino));
      } catch (err) {
        this.toast.danger('Não foi possível copiar', motivoDaFalha(err));
        return;
      }
      this.plano.set(plano);
      this.progresso.set(null);

      const salas = plano.salas.filter((s) => s.situacao === 'copiar' || s.situacao === 'atualizar');
      const turmas = ORDEM_DAS_TURMAS.flatMap((situacao) => plano.turmas.filter((t) => t.situacao === situacao));
      if (salas.length + turmas.length === 0) {
        this.toast.info('Nada para copiar', `${destino} já está igual a ${origem} no que dá para copiar.`);
        return;
      }
      // O plano fica na tela atrás do diálogo; sem confirmar, continua lá para consulta.
      if (!(await this.confirmarPlano(plano, origem, destino))) return;

      for (let i = 0; i < salas.length; i += SALAS_POR_LOTE) {
        const lote = salas.slice(i, i + SALAS_POR_LOTE);
        this.progresso.set({ fase: 'salas', atual: i + lote.length, total: salas.length });
        await this.copiarLote(codUsuario, origem, destino, lote);
      }
      // Uma de cada vez, como em SalasService.vincularTurmas: cada uma é um job da Fórmula Visual.
      for (const [i, turma] of turmas.entries()) {
        this.progresso.set({ fase: 'turmas', atual: i + 1, total: turmas.length });
        await this.gravarTurma(turma);
      }
      this.copiada.set(true);
    } finally {
      this.copiando.set(false);
      this.progresso.set(null);
    }
    this.avisarResultado(origem, destino);
    // A tela está no ano que acabou de receber a cópia: recarrega para mostrar.
    if (this.salasService.anoLetivo() === destino) this.salasService.carregar();
  }

  /** Diz o que vai mudar no destino antes de gravar: tirar turmas das salas não tem volta automática. */
  private confirmarPlano(plano: ApiCopiaAnoPlanoDto, origem: string, destino: string): Promise<boolean> {
    const salas = (s: ApiSituacaoCopiaAno) => plano.salas.filter((x) => x.situacao === s).length;
    const turmas = (s: ApiSituacaoCopiaAno) => plano.turmas.filter((x) => x.situacao === s).length;
    const mudancas = [
      listar([
        [salas('copiar'), 'sala copiada', 'salas copiadas'],
        [salas('atualizar'), 'sala atualizada', 'salas atualizadas'],
      ]),
      listar([
        [turmas('vincular'), 'turma vai para a sala', 'turmas vão para a sala'],
        [turmas('mover'), 'turma muda de sala', 'turmas mudam de sala'],
        [turmas('liberar'), 'turma sai da sala', 'turmas saem da sala'],
      ]),
    ].filter(Boolean);
    return this.confirmDialog.confirm({
      title: `Copiar ${origem} para ${destino}?`,
      description:
        `Para ${destino} ficar igual a ${origem}: ${mudancas.join('; ')}. ` +
        `Turmas que só existem em ${destino} não são mexidas. A lista completa está na tela.`,
      confirmLabel: 'Copiar',
      danger: turmas('liberar') + turmas('mover') + salas('atualizar') > 0,
    });
  }

  private async copiarLote(codUsuario: string, origem: string, destino: string, lote: ApiCopiaSalaDto[]): Promise<void> {
    let gravadas: Record<string, Gravacao>;
    try {
      const resultados = await firstValueFrom(this.api.copiarSalasDoAno(codUsuario, origem, destino, lote.map((s) => s.id)));
      gravadas = Object.fromEntries(resultados.map((r) => [r.id, { situacao: r.situacao, erro: r.erro ?? undefined }]));
    } catch (err) {
      // O lote inteiro caiu (ex.: sem conexão): os próximos seguem, e copiar de novo completa este.
      const erro = motivoDaFalha(err);
      gravadas = Object.fromEntries(lote.map((s) => [s.id, { situacao: 'falhou' as const, erro }]));
    }
    this.gravacaoSalas.update((atual) => ({ ...atual, ...gravadas }));
  }

  /** Põe a turma do destino na sala da origem; no "liberar", a sala vai vazia e ela sai da sala. */
  private async gravarTurma(turma: ApiCopiaTurmaDto): Promise<void> {
    let gravacao: Gravacao;
    try {
      const res = await firstValueFrom(
        this.api.salvarTurmaXSala({
          codFilial: turma.codFilial,
          codTurma: turma.codTurma,
          idPerlet: turma.idPerletDestino ?? 0,
          codBloco: turma.codBloco,
          codPredio: turma.codPredio,
          codSala: turma.codSala,
        }),
      );
      gravacao =
        res.sucesso === 1
          ? { situacao: GRAVADA[turma.situacao as GravacaoDeTurma] }
          : { situacao: 'falhou', erro: 'O RM não confirmou a gravação.' };
      if (res.sucesso === 1 && res.concluido === false) this.turmasPendentes.update((n) => n + 1);
    } catch (err) {
      gravacao = { situacao: 'falhou', erro: motivoDaFalha(err) };
    }
    this.gravacaoTurmas.update((atual) => ({ ...atual, [chaveDaTurma(turma)]: gravacao }));
  }

  private avisarResultado(origem: string, destino: string): void {
    const salas = this.contarSalas();
    const turmas = this.contarTurmas();
    const falhas = salas('falhou') + turmas('falhou');
    if (falhas > 0) {
      this.toast.warning(
        'Cópia concluída com falhas',
        `${falhas} não foram gravadas (veja as marcadas como "Falhou"). Copiar de novo grava só o que falta.`,
      );
      return;
    }
    const feito = listar([
      [salas('criada'), 'sala copiada', 'salas copiadas'],
      [salas('atualizada'), 'sala atualizada', 'salas atualizadas'],
      [turmas('vinculada'), 'turma colocada na sala', 'turmas colocadas nas salas'],
      [turmas('movida'), 'turma mudou de sala', 'turmas mudaram de sala'],
      [turmas('liberada'), 'turma saiu da sala', 'turmas saíram da sala'],
    ]);
    this.toast.success('Cópia concluída', feito ? `${destino} ficou igual a ${origem}: ${feito}.` : `${destino} já estava igual a ${origem}.`);
  }

  private limpar(): void {
    this.plano.set(null);
    this.copiada.set(false);
    this.gravacaoSalas.set({});
    this.gravacaoTurmas.set({});
    this.turmasPendentes.set(0);
  }

  private codUsuario(): string {
    return this.auth.currentUser()?.username ?? '';
  }
}
