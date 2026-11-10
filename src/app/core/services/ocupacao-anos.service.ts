import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { filiaisDasRespostas, fundirSalasEApi, juntarFiliais, nomesDasUnidades } from '../mock/ocupacao-adapter';
import { Sala } from '../models';
import { OcupacaoApiService } from './ocupacao-api.service';
import { RegrasService } from './regras.service';
import { SalasService } from './salas.service';

export type EstadoAno =
  | { estado: 'carregando' }
  | { estado: 'pronto'; salas: Sala[]; lidoEm: number }
  | { estado: 'erro' };

/** Depois disso, pedir o ano de novo relê do RM (alguém pode ter mexido nas turmas). */
const VALIDADE_MS = 5 * 60_000;

/**
 * Salas e turmas de outros anos letivos, para a aba "Comparar anos" do Mapa de Ocupação. O
 * SalasService guarda só o ano em uso; este lê os demais sob demanda, um ano de cada vez (cada
 * ano são três consultas ao RM), e guarda o resultado por alguns minutos. O ano em uso vem
 * sempre do SalasService, que já está atualizado com o que a pessoa gravou.
 */
@Injectable({ providedIn: 'root' })
export class OcupacaoAnosService {
  private readonly api = inject(OcupacaoApiService);
  private readonly auth = inject(AuthService);
  private readonly regras = inject(RegrasService);
  private readonly salasService = inject(SalasService);

  private readonly _anos = signal<ReadonlyMap<string, EstadoAno>>(new Map());
  /** Filiais vistas nos anos lidos aqui, para "CASJ 2" ser "CASJ 2" em todos os anos. */
  private readonly _filiais = signal<ReadonlyMap<number, string>>(new Map());
  private fila: string[] = [];
  private rodando = false;
  private usuario: string | null = null;

  /** "CASJ 2" pelo id da unidade (CODFILIAL), juntando as filiais de todos os anos lidos. */
  readonly nomesDasUnidades = computed(() => nomesDasUnidades(juntarFiliais(this.salasService.filiais(), this._filiais())));

  /** Outro login não herda os anos do anterior. */
  private conferirUsuario(): void {
    const usuario = this.auth.currentUser()?.username ?? null;
    if (usuario === this.usuario) return;
    this.usuario = usuario;
    this.fila = [];
    this._anos.set(new Map());
    this._filiais.set(new Map());
  }

  /**
   * Estado de cada ano pedido. O ano que o SalasService tem carregado sai dele, sem ir ao RM.
   */
  estado(ano: string): EstadoAno | undefined {
    if (ano === this.salasService.anoCarregado()) {
      return { estado: 'pronto', salas: this.salasService.salas(), lidoEm: Date.now() };
    }
    return this._anos().get(ano);
  }

  /** Põe na fila os anos que ainda não vieram (ou que já estão velhos) e os lê um de cada vez. */
  garantir(anos: readonly string[]): void {
    this.conferirUsuario();
    const agora = Date.now();
    const atual = this.salasService.anoCarregado();
    anos.forEach((ano) => {
      if (ano === atual || this.fila.includes(ano)) return;
      const e = this._anos().get(ano);
      if (e?.estado === 'carregando') return;
      if (e?.estado === 'pronto' && agora - e.lidoEm < VALIDADE_MS) return;
      this.fila.push(ano);
      this.definir(ano, { estado: 'carregando' });
    });
    void this.processar();
  }

  /** Tenta de novo um ano que falhou. */
  recarregar(ano: string): void {
    this._anos.update((m) => {
      const novo = new Map(m);
      novo.delete(ano);
      return novo;
    });
    this.garantir([ano]);
  }

  private definir(ano: string, estado: EstadoAno): void {
    this._anos.update((m) => new Map(m).set(ano, estado));
  }

  private async processar(): Promise<void> {
    if (this.rodando) return;
    this.rodando = true;
    try {
      while (this.fila.length > 0) {
        const ano = this.fila.shift()!;
        const usuario = this.usuario;
        if (!usuario) break;
        try {
          const [salasDto, vinculosDto, turmasDto] = await firstValueFrom(
            forkJoin([
              this.api.getSalasDoAno(usuario, ano),
              this.api.getTurmasXSalas(usuario, ano),
              this.api.getTurmas(usuario, ano),
            ]),
          );
          // Trocou o login no meio: a resposta é do usuário anterior.
          if (usuario !== this.usuario) continue;
          const doAno = filiaisDasRespostas(salasDto, vinculosDto, turmasDto);
          const conhecidas = juntarFiliais(juntarFiliais(this.salasService.filiais(), this._filiais()), doAno);
          const { salas, unidades } = fundirSalasEApi(salasDto, vinculosDto, turmasDto, conhecidas);
          this._filiais.update((f) => juntarFiliais(f, doAno));
          // A faixa usa o % máximo da regra de cada unidade.
          this.regras.carregarFiliais(unidades.map((u) => u.codFilial));
          this.definir(ano, { estado: 'pronto', salas, lidoEm: Date.now() });
        } catch {
          if (usuario === this.usuario) this.definir(ano, { estado: 'erro' });
        }
      }
    } finally {
      this.rodando = false;
    }
  }
}
