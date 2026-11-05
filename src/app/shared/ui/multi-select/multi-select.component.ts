import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { SaeaCheckboxComponent } from '@sistemas-saea/saea-design-system';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Linha menor abaixo do rótulo (ex.: "hoje em Sala 3"). */
  hint?: string;
  /** Opções do mesmo grupo ficam juntas, sob o título do grupo, na ordem em que aparecem. */
  group?: string;
}

/** Altura máxima da lista: abaixo disso de espaço livre sob o campo, ela abre para cima. */
const ALTURA_LISTA = 280;
/** O max-width do .ms-lista: num campo largo, a lista não acompanha a largura dele além disso. */
const LARGURA_MAXIMA_LISTA = 360;
const FOLGA = 4;

let nextId = 0;

/**
 * Seleção de várias opções com checkbox. A lista é um popover nativo: fica na camada de cima da
 * página (uma tabela com rolagem não a corta), fecha ao clicar fora ou com Esc e devolve o foco
 * ao botão. Fecha também se a página rolar, como o select nativo.
 *
 * O conteúdo projetado entra no campo, antes do botão, como destinatários num campo de e-mail
 * (ex.: as turmas já vinculadas, em fichas). Clicar no vazio do campo também abre a lista.
 *
 * Com `todas` (ex.: "Todas as unidades"), a primeira linha marca ou desmarca todas as opções, e o
 * botão mostra os nomes das marcadas (até duas; depois, "N selecionadas").
 */
@Component({
  selector: 'app-multi-select',
  standalone: true,
  imports: [SaeaCheckboxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ms-field">
      @if (label()) {
        <label class="ms-label" [for]="botaoId">
          {{ label() }}
          @if (obrigatorio()) {
            <span class="ms-obrigatorio" aria-hidden="true">*</span>
            <span class="ms-so-leitor">(obrigatório)</span>
          }
        </label>
      }
      <div
        #campo
        class="ms-campo"
        [class.ms-campo--sm]="size() === 'sm'"
        [class.ms-campo--desabilitado]="disabled()"
        (pointerdown)="estavaAberta = aberta()"
        (click)="aoClicarNoCampo($event)"
      >
        <ng-content />
        <button
          #gatilho
          type="button"
          class="ms-gatilho"
          [id]="botaoId"
          [class.ms-gatilho--marcado]="resumoMarcado()"
          [disabled]="disabled()"
          [attr.popovertarget]="listaId"
          [attr.title]="dicaDoBotao()"
        >
          <span class="ms-gatilho-texto">{{ resumo() }}</span>
          <span class="ms-seta" aria-hidden="true">▾</span>
        </button>
      </div>
      @if (helper()) {
        <div class="ms-helper">{{ helper() }}</div>
      }
    </div>
    <div
      #lista
      popover
      class="ms-lista"
      role="group"
      [id]="listaId"
      [attr.aria-label]="placeholder()"
      [style.top.px]="posicao().top"
      [style.bottom.px]="posicao().bottom"
      [style.left.px]="posicao().left"
      [style.right.px]="posicao().right"
      [style.min-width.px]="posicao().largura"
      (beforetoggle)="aoAlternar($event)"
      (toggle)="aoAbrir($event)"
    >
      <!-- Só monta as opções aberta: numa tabela são centenas de seletores com dezenas de opções. -->
      @if (aberta()) {
        @if (todas() && options().length > 1) {
          <saea-checkbox
            class="ms-opcao ms-opcao--todas"
            [checked]="todasMarcadas()"
            [indeterminate]="algumasMarcadas()"
            (checkedChange)="marcarTodas($event)"
          >
            <span class="ms-rotulo">{{ todas() }}</span>
          </saea-checkbox>
        }
        @for (grupo of grupos(); track grupo.nome) {
          @if (grupo.nome) {
            <div class="ms-grupo">{{ grupo.nome }}</div>
          }
          @for (opcao of grupo.opcoes; track opcao.value) {
            <saea-checkbox
              class="ms-opcao"
              [checked]="marcadas().has(opcao.value)"
              (checkedChange)="alternar(opcao.value, $event)"
            >
              <span class="ms-rotulo">{{ opcao.label }}</span>
              @if (opcao.hint) {
                <span class="ms-dica">{{ opcao.hint }}</span>
              }
            </saea-checkbox>
          }
        }
      }
    </div>
  `,
  styleUrl: './multi-select.component.css',
})
export class MultiSelectComponent {
  readonly listaId = `app-multi-select-${nextId++}`;
  readonly botaoId = `${this.listaId}-botao`;
  readonly options = input<MultiSelectOption[]>([]);
  readonly placeholder = input('Selecione...');
  readonly disabled = input(false);
  /** Rótulo em cima do campo, como o do app-select. */
  readonly label = input('');
  /** Texto de ajuda embaixo do campo, como o do app-select. */
  readonly helper = input('');
  /** Campo obrigatório: "*" depois do rótulo (e "(obrigatório)" para leitor de tela). */
  readonly obrigatorio = input(false);
  /** `sm`: mais baixo, para linha de tabela (mesmo critério do `size` do app-button). */
  readonly size = input<'sm' | 'md'>('md');
  /** "N selecionadas" no botão. Desligue quando as marcadas já aparecem em fichas no campo. */
  readonly contagem = input(true);
  /** Rótulo da linha que marca todas (ex.: "Todas as unidades"); '' = sem essa linha. */
  readonly todas = input('');
  /**
   * Nenhuma marcada vale como todas (campo de filtro): o botão mostra o texto de `todas` em vez do
   * placeholder.
   */
  readonly nenhumaEhTodas = input(false);
  /** Valores marcados, na ordem em que foram marcados. */
  readonly selected = model<string[]>([]);

  private readonly campo = viewChild.required<ElementRef<HTMLElement>>('campo');
  private readonly gatilho = viewChild.required<ElementRef<HTMLButtonElement>>('gatilho');
  private readonly lista = viewChild.required<ElementRef<HTMLElement>>('lista');
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  readonly aberta = signal(false);

  readonly marcadas = computed(() => new Set(this.selected()));

  /** As opções marcadas, na ordem da lista (não na ordem em que foram marcadas). */
  private readonly opcoesMarcadas = computed(() => {
    const marcadas = this.marcadas();
    return this.options().filter((o) => marcadas.has(o.value));
  });

  /** Todas as opções estão marcadas (com uma opção só, marcá-la já é "todas"). */
  readonly todasMarcadas = computed(() => {
    const opcoes = this.options();
    return opcoes.length > 0 && this.opcoesMarcadas().length === opcoes.length;
  });
  readonly algumasMarcadas = computed(() => this.opcoesMarcadas().length > 0 && !this.todasMarcadas());

  readonly resumo = computed(() => {
    const n = this.selected().length;
    if (!this.contagem()) return this.placeholder();
    if (this.todas()) {
      if (n === 0) return this.nenhumaEhTodas() ? this.todas() : this.placeholder();
      if (this.todasMarcadas() && this.options().length > 1) return this.todas();
      const nomes = this.opcoesMarcadas().map((o) => o.label);
      if (nomes.length > 0 && nomes.length <= 2) return nomes.join(', ');
    }
    if (n === 0) return this.placeholder();
    return n === 1 ? '1 selecionada' : `${n} selecionadas`;
  });

  /** O texto do botão é um valor (não o placeholder cinza). */
  readonly resumoMarcado = computed(
    () => this.contagem() && (this.selected().length > 0 || (!!this.todas() && this.nenhumaEhTodas())),
  );

  /** Passando o mouse, os nomes de todas as marcadas (o botão corta ou resume em "N selecionadas"). */
  readonly dicaDoBotao = computed(() => {
    const nomes = this.opcoesMarcadas().map((o) => o.label);
    return this.contagem() && nomes.length > 0 ? nomes.join('\n') : null;
  });

  /** A linha "Todas": marcada, marca todas as opções; desmarcada, nenhuma. */
  marcarTodas(marcado: boolean): void {
    this.selected.set(marcado ? this.options().map((o) => o.value) : []);
    afterNextRender(() => this.posicionar(), { injector: this.injector });
  }

  readonly grupos = computed(() => {
    const grupos = new Map<string, MultiSelectOption[]>();
    this.options().forEach((opcao) => {
      const nome = opcao.group ?? '';
      grupos.set(nome, [...(grupos.get(nome) ?? []), opcao]);
    });
    return Array.from(grupos, ([nome, opcoes]) => ({ nome, opcoes }));
  });

  readonly posicao = signal<{
    top: number | null;
    bottom: number | null;
    left: number | null;
    right: number | null;
    largura: number;
  }>({ top: null, bottom: null, left: null, right: null, largura: 0 });

  /** Rolar a página fecha a lista; rolar dentro dela, não. */
  private readonly aoRolar = (evento: Event) => {
    if (!this.lista().nativeElement.contains(evento.target as Node)) this.fechar();
  };
  private readonly fechar = () => this.lista().nativeElement.hidePopover();

  /** Se a lista estava aberta no pointerdown: o clique fora já a fecha, e não deve reabrir. */
  estavaAberta = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pararDeObservar());
  }

  /** Clique no vazio do campo (fora das fichas e do botão) abre a lista, como num campo de e-mail. */
  aoClicarNoCampo(evento: MouseEvent): void {
    if (evento.target !== evento.currentTarget || this.disabled() || this.estavaAberta) return;
    this.gatilho().nativeElement.click();
  }

  alternar(valor: string, marcado: boolean): void {
    this.selected.update((atual) =>
      marcado ? (atual.includes(valor) ? atual : [...atual, valor]) : atual.filter((v) => v !== valor),
    );
    // O que a tela mostra das marcadas (ex.: tags) pode mover o botão; a lista vai junto.
    afterNextRender(() => this.posicionar(), { injector: this.injector });
  }

  aoAlternar(evento: Event): void {
    if ((evento as ToggleEvent).newState !== 'open') {
      this.aberta.set(false);
      this.pararDeObservar();
      return;
    }
    this.posicionar();
    // Monta as opções antes de o navegador mostrar a lista, para ela não abrir vazia.
    this.aberta.set(true);
    this.cdr.detectChanges();
    window.addEventListener('scroll', this.aoRolar, true);
    window.addEventListener('resize', this.fechar);
  }

  /** Aberta, o foco vai para a primeira opção (Tab percorre as outras). */
  aoAbrir(evento: Event): void {
    if ((evento as ToggleEvent).newState === 'open') {
      this.lista().nativeElement.querySelector<HTMLInputElement>('input')?.focus();
    }
  }

  /** Põe a lista junto do campo: abaixo dele, ou acima se faltar espaço. */
  private posicionar(): void {
    const caixa = this.campo().nativeElement.getBoundingClientRect();
    const espacoAbaixo = window.innerHeight - caixa.bottom;
    const paraCima = espacoAbaixo < ALTURA_LISTA && caixa.top > espacoAbaixo;
    // Campo na metade direita da tela: a lista cresce para a esquerda, sem sair da tela.
    const alinharDireita = caixa.left > window.innerWidth / 2;
    this.posicao.set({
      top: paraCima ? null : caixa.bottom + FOLGA,
      bottom: paraCima ? window.innerHeight - caixa.top + FOLGA : null,
      left: alinharDireita ? null : caixa.left,
      right: alinharDireita ? window.innerWidth - caixa.right : null,
      // Um min-width acima do max-width ganharia dele e esticaria a lista.
      largura: Math.min(caixa.width, LARGURA_MAXIMA_LISTA),
    });
  }

  private pararDeObservar(): void {
    window.removeEventListener('scroll', this.aoRolar, true);
    window.removeEventListener('resize', this.fechar);
  }
}
