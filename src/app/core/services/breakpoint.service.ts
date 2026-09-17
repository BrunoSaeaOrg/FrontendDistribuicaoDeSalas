import { Injectable, OnDestroy, signal } from '@angular/core';

/** Mesmo breakpoint já usado nos grids responsivos de cada tela (ex: planta, solicitacoes). */
const MOBILE_QUERY = '(max-width: 880px)';

@Injectable({ providedIn: 'root' })
export class BreakpointService implements OnDestroy {
  private readonly mql: MediaQueryList | null =
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MOBILE_QUERY) : null;

  private readonly _isMobile = signal(this.mql?.matches ?? false);
  readonly isMobile = this._isMobile.asReadonly();

  private readonly listener = (e: MediaQueryListEvent): void => this._isMobile.set(e.matches);

  constructor() {
    this.mql?.addEventListener('change', this.listener);
  }

  ngOnDestroy(): void {
    this.mql?.removeEventListener('change', this.listener);
  }
}
