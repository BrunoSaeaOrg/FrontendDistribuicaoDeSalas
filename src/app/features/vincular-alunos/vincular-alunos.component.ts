import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaeaAvatarComponent, SaeaCheckboxComponent } from '@sistemas-saea/saea-design-system';
import { ToastService } from '../../core/services/toast.service';
import { AlertComponent } from '../../shared/ui/alert/alert.component';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';
import {
  ALUNOS_MOCK,
  ANOS_LETIVOS_MOCK,
  AlunoMock,
  SALAS_MOCK,
  SEM_TURMA,
  TURMAS_MOCK,
  TurmaMock,
} from './vincular-alunos.mock';

/** "1 aluno", "3 alunos". */
const qtdAlunos = (n: number) => `${n} ${n === 1 ? 'aluno' : 'alunos'}`;

/** Turma da sala escolhida, com a lotação contra as carteiras da sala. */
interface TurmaDaSala extends TurmaMock {
  alunos: AlunoMock[];
  carteiras: number;
  excede: boolean;
  /** Ocupação para a barra, no máximo 100. */
  pct: number;
}

/** Bloco da lista da esquerda: uma turma da sala, ou os alunos do ano sem turma. */
interface GrupoDeAlunos {
  id: string;
  titulo: string;
  alunos: AlunoMock[];
}

/**
 * PROTÓTIPO, com dados fictícios (vincular-alunos.mock.ts): mostra ao time a ideia de vincular
 * alunos a turmas. O ano letivo e a sala trazem, à esquerda, todos os alunos das turmas da sala
 * (agrupados por turma) e os do ano ainda sem turma; à direita ficam as turmas da sala. Marca-se
 * vários e usa o botão, ou arrasta-se um aluno (ou os marcados) até a turma. Mover só muda a
 * cópia em memória: nada vai para o RM, e recarregar desfaz tudo.
 */
@Component({
  selector: 'app-vincular-alunos',
  standalone: true,
  imports: [
    FormsModule,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    EmptyStateComponent,
    SelectComponent,
    SaeaAvatarComponent,
    SaeaCheckboxComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './vincular-alunos.component.html',
  styleUrl: './vincular-alunos.component.css',
})
export class VincularAlunosComponent {
  private readonly toast = inject(ToastService);

  readonly anoLetivo = signal('');
  readonly salaId = signal('');
  /** Alunos de cada turma, por ano: a cópia que o mover altera. */
  private readonly alunosPorTurma = signal(structuredClone(ALUNOS_MOCK));
  readonly selecionados = signal<ReadonlySet<string>>(new Set());
  readonly destinoId = signal<string | null>(null);
  /** Os últimos movidos: ficam destacados no grupo em que entraram. */
  readonly recemMovidos = signal<ReadonlySet<string>>(new Set());

  readonly arrastando = signal(false);
  /** Turma sobre a qual o arraste está passando. */
  readonly alvoDoArraste = signal<string | null>(null);
  private arrastados: string[] = [];

  readonly qtdAlunos = qtdAlunos;

  readonly anoOptions: SelectOption[] = [
    { value: '', label: 'Selecione o ano' },
    ...ANOS_LETIVOS_MOCK.map((ano) => ({ value: ano, label: ano })),
  ];

  readonly salaOptions = computed<SelectOption[]>(() => {
    const ano = this.anoLetivo();
    if (!ano) return [{ value: '', label: 'Escolha o ano letivo antes' }];
    return [
      { value: '', label: 'Selecione a sala' },
      ...SALAS_MOCK[ano].map((s) => ({ value: s.id, label: `${s.nome} · ${s.unidade} · ${s.andar}` })),
    ];
  });

  readonly sala = computed(() => SALAS_MOCK[this.anoLetivo()]?.find((s) => s.id === this.salaId()) ?? null);

  readonly turmasDaSala = computed<TurmaDaSala[]>(() => {
    const sala = this.sala();
    if (!sala) return [];
    const porTurma = this.alunosPorTurma()[this.anoLetivo()];
    return TURMAS_MOCK[this.anoLetivo()]
      .filter((t) => t.salaId === sala.id)
      .map((t) => {
        const alunos = porTurma[t.id];
        return {
          ...t,
          alunos,
          carteiras: sala.carteiras,
          excede: alunos.length > sala.carteiras,
          pct: Math.min(100, Math.round((alunos.length / sala.carteiras) * 100)),
        };
      });
  });

  /** As turmas da sala e, por último, os alunos do ano ainda sem turma. */
  readonly grupos = computed<GrupoDeAlunos[]>(() => {
    if (!this.sala()) return [];
    return [
      ...this.turmasDaSala().map((t) => ({ id: t.id, titulo: `${t.nome} · ${t.turno}`, alunos: t.alunos })),
      { id: SEM_TURMA, titulo: 'Sem turma', alunos: this.alunosPorTurma()[this.anoLetivo()][SEM_TURMA] },
    ];
  });

  readonly totalNaSala = computed(() => this.turmasDaSala().reduce((total, t) => total + t.alunos.length, 0));
  readonly qtdSelecionados = computed(() => this.selecionados().size);
  readonly destino = computed(() => this.turmasDaSala().find((t) => t.id === this.destinoId()) ?? null);

  readonly rotuloMover = computed(() => {
    const n = this.qtdSelecionados();
    const destino = this.destino();
    if (n === 0) return 'Marque os alunos para mover';
    if (!destino) return `Escolha a turma para ${n === 1 ? 'o aluno' : `os ${n} alunos`}`;
    return `Mover ${qtdAlunos(n)} para ${destino.nome}`;
  });

  selecionarAno(ano: string): void {
    this.anoLetivo.set(ano);
    this.salaId.set('');
    this.limpar();
  }

  selecionarSala(sala: string): void {
    this.salaId.set(sala);
    this.limpar();
  }

  todosDoGrupo(grupo: GrupoDeAlunos): boolean {
    return grupo.alunos.length > 0 && grupo.alunos.every((a) => this.selecionados().has(a.id));
  }

  algunsDoGrupo(grupo: GrupoDeAlunos): boolean {
    return !this.todosDoGrupo(grupo) && grupo.alunos.some((a) => this.selecionados().has(a.id));
  }

  alternarGrupo(grupo: GrupoDeAlunos, marcado: boolean): void {
    this.selecionados.update((atual) => {
      const proximos = new Set(atual);
      grupo.alunos.forEach((a) => (marcado ? proximos.add(a.id) : proximos.delete(a.id)));
      return proximos;
    });
  }

  alternarAluno(id: string, marcado: boolean): void {
    this.selecionados.update((atual) => {
      const proximos = new Set(atual);
      if (marcado) proximos.add(id);
      else proximos.delete(id);
      return proximos;
    });
  }

  desmarcarTodos(): void {
    this.selecionados.set(new Set());
  }

  escolherDestino(id: string): void {
    this.destinoId.set(id);
  }

  moverSelecionados(): void {
    const destino = this.destinoId();
    if (destino && this.qtdSelecionados() > 0) this.mover([...this.selecionados()], destino);
  }

  /** Arrastar um aluno marcado leva todos os marcados; um não marcado vai sozinho. */
  aoComecarArraste(aluno: AlunoMock, evento: DragEvent): void {
    this.arrastados = this.selecionados().has(aluno.id) ? [...this.selecionados()] : [aluno.id];
    this.arrastando.set(true);
    const transferencia = evento.dataTransfer;
    if (!transferencia) return;
    transferencia.effectAllowed = 'move';
    transferencia.setData('text/plain', this.arrastados.join(','));
    if (this.arrastados.length > 1) transferencia.setDragImage(this.fantasma(this.arrastados.length), 16, 16);
  }

  aoTerminarArraste(): void {
    this.arrastando.set(false);
    this.alvoDoArraste.set(null);
    this.arrastados = [];
  }

  aoArrastarSobre(turmaId: string, evento: DragEvent): void {
    if (!this.arrastando()) return;
    evento.preventDefault();
    if (evento.dataTransfer) evento.dataTransfer.dropEffect = 'move';
    this.alvoDoArraste.set(turmaId);
  }

  aoSairDoAlvo(turmaId: string, evento: DragEvent): void {
    // Passar sobre um filho do cartão também dispara dragleave: só sai quando deixa o cartão.
    if ((evento.currentTarget as HTMLElement).contains(evento.relatedTarget as Node | null)) return;
    if (this.alvoDoArraste() === turmaId) this.alvoDoArraste.set(null);
  }

  aoSoltar(turmaId: string, evento: DragEvent): void {
    evento.preventDefault();
    const ids = this.arrastados;
    this.aoTerminarArraste();
    if (ids.length === 0) return;
    this.destinoId.set(turmaId);
    this.mover(ids, turmaId);
  }

  private limpar(): void {
    this.selecionados.set(new Set());
    this.destinoId.set(null);
    this.recemMovidos.set(new Set());
  }

  /** Tira os alunos de onde estiverem (outra turma da sala ou sem turma) e põe no topo da turma. */
  private mover(ids: string[], destinoId: string): void {
    const ano = this.anoLetivo();
    const turma = this.turmasDaSala().find((t) => t.id === destinoId);
    if (!turma) return;
    const marcados = new Set(ids);
    const doAno = this.alunosPorTurma()[ano];
    // Quem já está na turma de destino fica onde está.
    const chegando = Object.entries(doAno)
      .filter(([id]) => id !== destinoId)
      .flatMap(([, alunos]) => alunos.filter((a) => marcados.has(a.id)));
    this.selecionados.set(new Set());
    if (chegando.length === 0) {
      this.toast.info(`Os alunos marcados já estão no ${turma.nome}`);
      return;
    }
    const movidos = new Set(chegando.map((a) => a.id));
    this.alunosPorTurma.update((atual) => ({
      ...atual,
      [ano]: Object.fromEntries(
        Object.entries(atual[ano]).map(([id, alunos]) => [
          id,
          id === destinoId ? [...chegando, ...alunos] : alunos.filter((a) => !movidos.has(a.id)),
        ]),
      ),
    }));
    this.recemMovidos.set(movidos);

    const total = turma.alunos.length + chegando.length;
    const titulo = `${qtdAlunos(chegando.length)} ${chegando.length === 1 ? 'movido' : 'movidos'} para ${turma.nome}`;
    if (total > turma.carteiras) this.toast.warning(titulo, `A turma passou das carteiras da sala: ${total} de ${turma.carteiras}.`);
    else this.toast.success(titulo, 'Protótipo: nada foi gravado no RM.');
  }

  /** Imagem do arraste com vários alunos: uma pílula "3 alunos" no lugar da linha do primeiro. */
  private fantasma(quantidade: number): HTMLElement {
    const pilula = document.createElement('div');
    pilula.textContent = qtdAlunos(quantidade);
    // Fora do template, o CSS do componente não chega nela: estilo direto.
    Object.assign(pilula.style, {
      position: 'fixed',
      top: '-100px',
      padding: '6px 12px',
      borderRadius: '999px',
      background: 'var(--saea-primary-strong)',
      color: '#fff',
      font: '600 13px var(--font-body)',
    });
    document.body.appendChild(pilula);
    // O navegador copia a imagem na hora do setDragImage; depois ela pode sair.
    setTimeout(() => pilula.remove());
    return pilula;
  }
}
