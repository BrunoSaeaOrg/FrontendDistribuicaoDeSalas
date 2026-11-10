import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';

/** De quanto em quanto tempo a barra anda. */
const PASSO_MS = 250;

/**
 * Véu de carregamento sobre o elemento pai, que precisa de position: relative (a classe global
 * .saea-carregavel, posta no app-card). Enquanto `ativo`, cobre o conteúdo com o spinner e o texto,
 * para dados velhos não parecerem os novos; o conteúdo continua no lugar, então nada pula quando a
 * carga termina.
 *
 * Carga demorada (ex.: uma consulta lenta no RM) passa `estimativaMs` e ganha uma barra no lugar do
 * spinner, com o tempo decorrido. O RM não diz quanto falta: a barra anda pela estimativa, rápido
 * no começo e mais devagar perto do fim, e não chega ao fim antes de a carga terminar.
 */
@Component({
  selector: 'app-carregando',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ativo()) {
      <div class="saea-carregando" role="status">
        @if (estimativaMs(); as estimativa) {
          <span class="saea-carregando-texto">{{ texto() }}</span>
          <span
            class="saea-carregando-barra"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-valuenow]="pct()"
            [attr.aria-valuetext]="tempo() + ' de cerca de ' + segundos(estimativa)"
          >
            <span class="saea-carregando-preenchido" [style.width.%]="pct()"></span>
          </span>
          <span class="saea-carregando-detalhe">{{ tempo() }} · costuma levar cerca de {{ segundos(estimativa) }}</span>
        } @else {
          <span class="saea-carregando-spinner" aria-hidden="true"></span>
          <span class="saea-carregando-texto">{{ texto() }}</span>
        }
      </div>
    }
  `,
  styleUrl: './carregando.component.css',
})
export class CarregandoComponent {
  readonly ativo = input(false);
  readonly texto = input('Carregando...');
  /** Quanto a carga costuma levar. Com ele, a barra no lugar do spinner. */
  readonly estimativaMs = input<number | null>(null);

  private readonly decorridoMs = signal(0);

  /** Até 95%: 63% na estimativa, 86% no dobro. O fim fica para quando a carga termina. */
  readonly pct = computed(() => {
    const estimativa = this.estimativaMs();
    if (!estimativa) return 0;
    return Math.round(95 * (1 - Math.exp(-this.decorridoMs() / estimativa)));
  });

  readonly tempo = computed(() => this.segundos(this.decorridoMs()));

  constructor() {
    let relogio: ReturnType<typeof setInterval> | null = null;
    const parar = () => {
      if (relogio !== null) clearInterval(relogio);
      relogio = null;
    };
    effect(() => {
      parar();
      this.decorridoMs.set(0);
      if (!this.ativo() || !this.estimativaMs()) return;
      const inicio = Date.now();
      relogio = setInterval(() => this.decorridoMs.set(Date.now() - inicio), PASSO_MS);
    });
    inject(DestroyRef).onDestroy(parar);
  }

  /** 4200 → "4 s"; 75000 → "1 min 15 s". */
  segundos(ms: number): string {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s} s`;
    const resto = s % 60;
    return resto ? `${Math.floor(s / 60)} min ${resto} s` : `${Math.floor(s / 60)} min`;
  }
}
