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

/** Altura máxima da lista: abaixo disso de espaço livre sob o botão, ela abre para cima. */
const ALTURA_LISTA = 280;
const FOLGA = 4;

let nextId = 0;

/**
 * Seleção de várias opções com checkbox. A lista é um popover nativo: fica na camada de cima da
 * página (uma tabela com rolagem não a corta), fecha ao clicar fora ou com Esc e devolve o foco
 * ao botão. Fecha também se a página rolar, como o select nativo.
 */
@Component({
  selector: 'app-multi-select',
  standalone: true,
  imports: [SaeaCheckboxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #gatilho
      type="button"
      class="ms-gatilho"
      [class.ms-gatilho--marcado]="selected().length > 0"
      [disabled]="disabled()"
      [attr.popovertarget]="listaId"
    >
      <span class="ms-gatilho-texto">{{ resumo() }}</span>
      <span class="ms-seta" aria-hidden="true">▾</span>
    </button>
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
  readonly options = input<MultiSelectOption[]>([]);
  readonly placeholder = input('Selecione...');
  readonly disabled = input(false);
  /** Valores marcados, na ordem em que foram marcados. */
  readonly selected = model<string[]>([]);

  private readonly gatilho = viewChild.required<ElementRef<HTMLButtonElement>>('gatilho');
  private readonly lista = viewChild.required<ElementRef<HTMLElement>>('lista');
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);

  readonly aberta = signal(false);

  readonly marcadas = computed(() => new Set(this.selected()));

  readonly resumo = computed(() => {
    const n = this.selected().length;
    if (n === 0) return this.placeholder();
    return n === 1 ? '1 selecionada' : `${n} selecionadas`;
  });

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

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pararDeObservar());
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

  /** Põe a lista junto do botão: abaixo dele, ou acima se faltar espaço. */
  private posicionar(): void {
    const caixa = this.gatilho().nativeElement.getBoundingClientRect();
    const espacoAbaixo = window.innerHeight - caixa.bottom;
    const paraCima = espacoAbaixo < ALTURA_LISTA && caixa.top > espacoAbaixo;
    // Botão na metade direita da tela: a lista cresce para a esquerda, sem sair da tela.
    const alinharDireita = caixa.left > window.innerWidth / 2;
    this.posicao.set({
      top: paraCima ? null : caixa.bottom + FOLGA,
      bottom: paraCima ? window.innerHeight - caixa.top + FOLGA : null,
      left: alinharDireita ? null : caixa.left,
      right: alinharDireita ? window.innerWidth - caixa.right : null,
      largura: caixa.width,
    });
  }

  private pararDeObservar(): void {
    window.removeEventListener('scroll', this.aoRolar, true);
    window.removeEventListener('resize', this.fechar);
  }
}
