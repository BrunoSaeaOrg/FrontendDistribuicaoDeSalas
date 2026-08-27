import { Injectable, signal } from '@angular/core';
import { REGRAS_PADRAO, RegrasOcupacao } from '../models';

@Injectable({ providedIn: 'root' })
export class RegrasService {
  private readonly _regras = signal<RegrasOcupacao>({ ...REGRAS_PADRAO });
  readonly regras = this._regras.asReadonly();

  setAreaPorAluno(value: number): void {
    this._regras.update((r) => ({ ...r, areaPorAluno: value || 0 }));
  }

  setPctMaximoUtilizacao(value: number): void {
    const clamped = Math.min(100, Math.max(1, value || 0));
    this._regras.update((r) => ({ ...r, pctMaximoUtilizacao: clamped }));
  }

  setPermitirExcesso(value: boolean): void {
    this._regras.update((r) => ({ ...r, permitirExcesso: value }));
  }

  togglePermitirExcesso(): void {
    this._regras.update((r) => ({ ...r, permitirExcesso: !r.permitirExcesso }));
  }

  restaurarPadroes(): void {
    this._regras.set({ ...REGRAS_PADRAO });
  }
}
