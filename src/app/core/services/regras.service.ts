import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, concatMap, EMPTY, from, map, of } from 'rxjs';
import { REGRAS_PADRAO, RegrasOcupacao } from '../models';
import { ApiRegraDto } from '../models/ocupacao-api.model';
import { OcupacaoApiService } from './ocupacao-api.service';
import { ToastService } from './toast.service';

/** O registro da filial na resposta (a consulta filtra pelo CODFILIAL, mas confere). */
function regraDaFilial(regras: ApiRegraDto[], codFilial: number): ApiRegraDto | undefined {
  return regras.find((r) => Number(r.CODFILIAL) === codFilial) ?? (regras.length === 1 && regras[0].CODFILIAL == null ? regras[0] : undefined);
}

function deApi(regra: ApiRegraDto): RegrasOcupacao {
  return {
    areaPorAluno: regra.AREAPORPESSOA,
    pctMaximoUtilizacao: regra.PERCMAXUTIL,
    // Padrao RM (antigo TOTVS) para campo SN: 1 = Sim, 2 = Nao.
    permitirExcesso: regra.PERMEXCEDER === 1,
  };
}

/** Unidade em que as regras do formulário são gravadas: a filial e o nome dela na tela ("CASJ 1"). */
export interface DestinoDasRegras {
  codFilial: number;
  nome: string;
}

/** "CASJ 1", "CASJ 1 e CASJ 2", "CASJ 1, CASJ 2 e Liceu". */
export function listaDeNomes(nomes: readonly string[]): string {
  return nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

/**
 * Observação gravada ao restaurar os padrões: o padrão deixa exceder, e com isso o RM exige
 * observação. Diz de onde veio a regra, com a data.
 */
export function obsDosPadroes(hoje = new Date()): string {
  return `Padrões do sistema restaurados em ${hoje.toLocaleDateString('pt-BR')}.`;
}

/**
 * Regras de ocupação. São duas coisas:
 * - as regras de cada filial (`regrasDaFilial`), que Painel, Planta e Solicitações usam: carregadas
 *   uma vez por filial quando as salas chegam (`carregarFiliais`) e atualizadas ao salvar;
 * - o formulário da tela Regras (`regras`, `obs`): abre com as da primeira unidade marcada nela e
 *   é gravado em todas as marcadas.
 */
@Injectable({ providedIn: 'root' })
export class RegrasService {
  private readonly ocupacaoApi = inject(OcupacaoApiService);
  private readonly toast = inject(ToastService);

  private readonly _regras = signal<RegrasOcupacao>({ ...REGRAS_PADRAO });
  private readonly _obs = signal('');
  private readonly _salvando = signal(false);
  private readonly _carregando = signal(false);

  /** Formulário da tela Regras. */
  readonly regras = this._regras.asReadonly();
  readonly obs = this._obs.asReadonly();
  readonly salvando = this._salvando.asReadonly();
  readonly carregando = this._carregando.asReadonly();

  /** Com "Permitir exceder" ligado, a observação é obrigatória (o porquê de deixar passar do limite). */
  readonly faltaObs = computed(() => this._regras().permitirExcesso && !this._obs().trim());

  /** As regras de cada filial (CODFILIAL). Filial sem registro no RM fica com os padrões. */
  private readonly _porFilial = signal<Readonly<Record<number, RegrasOcupacao>>>({});
  /** Filiais já pedidas ao RM: cada uma é lida uma vez por sessão (o F5 lê de novo). */
  private readonly filiaisPedidas = new Set<number>();

  /** As regras que valem para as salas da filial; enquanto não chegam do RM, os padrões. */
  regrasDaFilial(codFilial: number): RegrasOcupacao {
    return this._porFilial()[codFilial] ?? REGRAS_PADRAO;
  }

  /** Lê do RM as regras das filiais que ainda não vieram, uma de cada vez (sem rajada no RM). */
  carregarFiliais(filiais: number[]): void {
    const novas = [...new Set(filiais)].filter((f) => f > 0 && !this.filiaisPedidas.has(f));
    if (novas.length === 0) return;
    novas.forEach((f) => this.filiaisPedidas.add(f));
    from(novas)
      .pipe(
        concatMap((f) =>
          this.ocupacaoApi.getRegras(f).pipe(
            map((regras) => ({ f, regra: regraDaFilial(regras, f) })),
            catchError(() => {
              // Fica com os padrões e tenta de novo na próxima carga das salas.
              this.filiaisPedidas.delete(f);
              return EMPTY;
            }),
          ),
        ),
      )
      .subscribe(({ f, regra }) => this.guardarDaFilial(f, regra ? deApi(regra) : { ...REGRAS_PADRAO }));
  }

  private guardarDaFilial(codFilial: number, regras: RegrasOcupacao): void {
    this.filiaisPedidas.add(codFilial);
    this._porFilial.update((todas) => ({ ...todas, [codFilial]: { ...regras } }));
  }

  /** Busca as regras salvas da filial no TOTVS para o formulário; sem registro, os padroes. */
  carregar(codFilial: number): void {
    this._carregando.set(true);
    this.ocupacaoApi.getRegras(codFilial).subscribe({
      next: (regras) => {
        this._carregando.set(false);
        const regra = regraDaFilial(regras, codFilial);
        const salvas = regra ? deApi(regra) : { ...REGRAS_PADRAO };
        this._regras.set({ ...salvas });
        this._obs.set(regra?.OBS ?? '');
        this.guardarDaFilial(codFilial, salvas);
      },
      error: () => {
        this._carregando.set(false);
        this.toast.danger('Falha ao carregar regras', 'Não foi possível contatar o servidor.');
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

  /**
   * Restaura os padrões do sistema (1,5 m², 90%, pode exceder) e já grava em cada unidade marcada,
   * uma de cada vez, com a observação dos padrões (o RM exige observação quando pode exceder).
   */
  restaurarPadroes(destinos: readonly DestinoDasRegras[]): void {
    if (destinos.length === 0 || this._salvando()) return;
    this._regras.set({ ...REGRAS_PADRAO });
    this._obs.set(obsDosPadroes());
    this.salvar(destinos, 'Padrões restaurados');
  }

  /**
   * Grava o formulário em cada unidade marcada, uma de cada vez (sem rajada no RM). Uma unidade que
   * falhar não impede as outras; o aviso no fim diz quais foram e quais não.
   */
  salvar(destinos: readonly DestinoDasRegras[], tituloDoSucesso = 'Regras salvas'): void {
    if (destinos.length === 0) return;
    const regras = this._regras();
    if (this.faltaObs()) {
      this.toast.warning('Falta a observação', 'Com "Permitir exceder" ligado, diga por que as salas podem passar do limite.');
      return;
    }
    this._salvando.set(true);
    const obs = this._obs();
    const salvas: string[] = [];
    const falhas: string[] = [];
    let semConexao = false;

    from(destinos)
      .pipe(
        concatMap((destino) =>
          this.ocupacaoApi
            .salvarRegras({
              codFilial: destino.codFilial,
              areaPorPessoa: regras.areaPorAluno,
              percMaxUtil: regras.pctMaximoUtilizacao,
              permExceder: regras.permitirExcesso,
              obs,
            })
            .pipe(
              map((gravado) => ({ destino, gravado, falhou: false })),
              catchError((err: { status?: number }) => {
                if (!err?.status) semConexao = true;
                return of({ destino, gravado: null, falhou: true });
              }),
            ),
        ),
      )
      .subscribe({
        // O back responde 200 com o registro gravado (não há CodRetorno; antes a tela esperava
        // CodRetorno === 1 e dizia "Não foi possível salvar" mesmo com o RM gravando).
        next: ({ destino, gravado, falhou }) => {
          if (falhou) {
            falhas.push(destino.nome);
            return;
          }
          // A tela fica com o que o RM gravou de fato (foi assim que o 1,5 virando 15 apareceria).
          const final: RegrasOcupacao = {
            areaPorAluno: typeof gravado?.AREAPORPESSOA === 'number' ? gravado.AREAPORPESSOA : regras.areaPorAluno,
            pctMaximoUtilizacao: typeof gravado?.PERCMAXUTIL === 'number' ? gravado.PERCMAXUTIL : regras.pctMaximoUtilizacao,
            permitirExcesso: gravado?.PERMEXCEDER != null ? gravado.PERMEXCEDER === 1 : regras.permitirExcesso,
          };
          this._regras.set(final);
          // As outras telas passam a usar as regras novas da filial na hora.
          this.guardarDaFilial(destino.codFilial, final);
          salvas.push(destino.nome);
        },
        complete: () => {
          this._salvando.set(false);
          if (falhas.length === 0) {
            this.toast.success(tituloDoSucesso, `Aplicadas em ${listaDeNomes(salvas)}.`);
          } else if (salvas.length > 0) {
            this.toast.warning(
              'Regras salvas em parte',
              `Aplicadas em ${listaDeNomes(salvas)}. O RM não gravou em ${listaDeNomes(falhas)}: tente de novo.`,
            );
          } else {
            this.toast.danger(
              'Falha ao salvar regras',
              semConexao ? 'Não foi possível contatar o servidor.' : 'O RM não gravou as regras. Tente de novo.',
            );
          }
        },
      });
  }
}
