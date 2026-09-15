import { inject, Injectable, signal } from '@angular/core';
import { REGRAS_PADRAO, RegrasOcupacao } from '../models';
import { OcupacaoApiService } from './ocupacao-api.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class RegrasService {
  private readonly ocupacaoApi = inject(OcupacaoApiService);
  private readonly toast = inject(ToastService);

  private readonly _regras = signal<RegrasOcupacao>({ ...REGRAS_PADRAO });
  private readonly _obs = signal('');
  private readonly _salvando = signal(false);
  private readonly _carregando = signal(false);

  readonly regras = this._regras.asReadonly();
  readonly obs = this._obs.asReadonly();
  readonly salvando = this._salvando.asReadonly();
  readonly carregando = this._carregando.asReadonly();

  /** Busca as regras salvas da filial no TOTVS; sem registro, mantem os padroes. */
  carregar(codFilial: number): void {
    this._carregando.set(true);
    this.ocupacaoApi.getRegras(codFilial).subscribe({
      next: (regras) => {
        this._carregando.set(false);
        const regra = regras[0];
        if (!regra) {
          this._regras.set({ ...REGRAS_PADRAO });
          this._obs.set('');
          return;
        }
        this._regras.set({
          areaPorAluno: regra.AREAPORPESSOA,
          pctMaximoUtilizacao: regra.PERCMAXUTIL,
          // Padrao RM (antigo TOTVS) para campo SN: 1 = Sim, 2 = Nao.
          permitirExcesso: regra.PERMEXCEDER === 1,
        });
        this._obs.set(regra.OBS ?? '');
      },
      error: (err) => {
        this._carregando.set(false);
        this.toast.danger('Falha ao carregar regras', err.message || 'Não foi possível contatar o servidor.');
      },
    });
  }

  setObs(value: string): void {
    this._obs.set(value);
  }

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
    this._obs.set('');
  }

  salvar(codFilial: number): void {
    const regras = this._regras();
    this._salvando.set(true);

    this.ocupacaoApi
      .salvarRegras({
        codFilial,
        areaPorPessoa: regras.areaPorAluno,
        percMaxUtil: regras.pctMaximoUtilizacao,
        permExceder: regras.permitirExcesso,
        obs: this._obs(),
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
