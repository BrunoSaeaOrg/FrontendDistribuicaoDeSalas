import { inject, Injectable, signal } from '@angular/core';
import { REGRAS_PADRAO, RegrasOcupacao } from '../models';
import { OcupacaoApiService } from './ocupacao-api.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class RegrasService {
  private readonly ocupacaoApi = inject(OcupacaoApiService);
  private readonly toast = inject(ToastService);

  private readonly _regras = signal<RegrasOcupacao>({ ...REGRAS_PADRAO });
  private readonly _salvando = signal(false);

  readonly regras = this._regras.asReadonly();
  readonly salvando = this._salvando.asReadonly();

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

  salvar(codFilial: number, obs: string): void {
    const regras = this._regras();
    this._salvando.set(true);

    this.ocupacaoApi
      .salvarRegras({
        codFilial,
        areaPorPessoa: regras.areaPorAluno,
        percMaxUtil: regras.pctMaximoUtilizacao,
        permExceder: regras.permitirExcesso,
        obs,
      })
      .subscribe({
        next: (res) => {
          this._salvando.set(false);
          if (res.CodRetorno === 1) {
            this.toast.success('Regras salvas', `Aplicadas à filial ${codFilial}.`);
          } else {
            this.toast.danger('Não foi possível salvar', res.Data || 'O TOTVS recusou a operação.');
          }
        },
        error: (err) => {
          this._salvando.set(false);
          this.toast.danger('Falha ao salvar regras', err.message || 'Não foi possível contatar o servidor.');
        },
      });
  }
}
