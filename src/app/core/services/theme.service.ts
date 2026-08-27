import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'saea-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _isDark = signal<boolean>(this.readInitial());
  readonly isDark = this._isDark.asReadonly();

  constructor() {
    this.apply(this._isDark());
  }

  toggle(): void {
    const next = !this._isDark();
    this._isDark.set(next);
    this.apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      /* localStorage indisponível — preferência não persiste, mas app continua funcional */
    }
  }

  private readInitial(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark') return true;
      if (stored === 'light') return false;
    } catch {
      /* ignora — segue para preferência do SO */
    }
    return typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  }

  private apply(isDark: boolean): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }
}
