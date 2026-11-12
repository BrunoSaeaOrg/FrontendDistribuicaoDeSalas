import { inject, Injectable, signal } from '@angular/core';
import { concatMap, finalize, from, Observable, reduce, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ApiAlunoEnturmacaoDto, ApiEnturmacaoResultadoDto, ApiTurmaEnturmacaoDto } from '../models/ocupacao-api.model';
import { OcupacaoApiService } from './ocupacao-api.service';

export type EstadoAlunos =
  | { estado: 'carregando' }
  | { estado: 'pronto'; alunos: readonly ApiAlunoEnturmacaoDto[]; lidoEm: number }
  | { estado: 'erro' };

/** Movimentos já gravados no RM e ainda não importados: RA → turma para onde vai. */
export type EstadoPendentes =
  | { estado: 'carregando' }
  | { estado: 'pronto'; porRa: ReadonlyMap<string, string> }
  | { estado: 'erro' };

/**
 * Alunos cujo último registro no MD está como Importado (já na matrícula): RA → turma do registro.
 * Só serve para a etiqueta "Importado" no destino: sem eles, a tela funciona igual.
 */
export type EstadoImportados = EstadoPendentes;

/** As turmas do cadastro no ano da unidade: o destino da tela. */
export type EstadoTurmas =
  | { estado: 'carregando' }
  | { estado: 'pronto'; turmas: readonly ApiTurmaEnturmacaoDto[] }
  | { estado: 'erro' };

/** Igual ao cache do back: depois disso, pedir de novo relê do RM. */
const VALIDADE_MS = 5 * 60_000;

/** O back aceita até 200 RAs por pedido. */
const FOTOS_POR_PEDIDO = 200;

/** O back grava até 100 movimentos por pedido. */
const MOVIMENTOS_POR_PEDIDO = 100;

/** O que a tela mostrava: a unidade, a série e a turma de cada lado, no ano em que foram escolhidas. */
export interface SelecaoDaTela {
  ano: string;
  codFilial: number | null;
  serie: string;
  origemId: string | null;
  destinoId: string | null;
}

/**
 * Alunos de cada ano e filial para a tela "Vincular aluno à turma" (OC_SAL_ENTUR_ALUNOS), as
 * turmas do cadastro, que são o destino (OC_SAL_ENTUR_TURMAS), as fotos dos que a tela mostra
 * (OC_SAL_ENTUR_FOTOS), os movimentos já gravados no MD de enturmação (OC_SAL_ENTUR_PENDENTES),
 * que a tela mostra por cima da turma da matrícula, e os já importados (OC_SAL_ENTUR_IMPORTADOS),
 * que ganham a etiqueta "Importado" no destino.
 *
 * Fica fora da tela porque a leitura é lenta e porque o app recria a tela ao passar para o tamanho
 * de celular ou ao trocar de layout (cada um tem o seu router-outlet). Pelo mesmo motivo, os
 * movimentos ainda não salvos e a escolha da tela também ficam aqui: recriada, ela volta como estava.
 */
@Injectable({ providedIn: 'root' })
export class AlunosEnturmacaoService {
  private readonly api = inject(OcupacaoApiService);
  private readonly auth = inject(AuthService);
  private readonly _estados = signal<ReadonlyMap<string, EstadoAlunos>>(new Map());
  private readonly _pendentes = signal<ReadonlyMap<string, EstadoPendentes>>(new Map());
  private readonly _importados = signal<ReadonlyMap<string, EstadoImportados>>(new Map());
  private readonly _turmas = signal<ReadonlyMap<string, EstadoTurmas>>(new Map());
  /** Fotos que chegaram, por "ano|filial" e RA. */
  private readonly _fotos = signal<ReadonlyMap<string, ReadonlyMap<string, string>>>(new Map());
  /** RAs já pedidos (com ou sem foto), por "ano|filial": não se pede o mesmo de novo. */
  private readonly fotosPedidas = new Map<string, Set<string>>();

  /** Para onde cada aluno foi movido na tela e ainda não foi salvo (RA → CODTURMA ou "sem-turma"), por "ano|filial". */
  readonly movimentos = signal<ReadonlyMap<string, ReadonlyMap<string, string>>>(new Map());
  /** Por que o movimento do aluno não foi salvo na última vez (RA → motivo). */
  readonly falhas = signal<ReadonlyMap<string, string>>(new Map());
  /** Quantos movimentos estão sendo salvos agora (0 = nenhum). */
  readonly salvando = signal(0);
  /** A última escolha da tela; null = ela ainda não foi aberta. */
  selecao: SelecaoDaTela | null = null;

  estado(ano: string, codFilial: number): EstadoAlunos | undefined {
    return this._estados().get(chave(ano, codFilial));
  }

  pendentes(ano: string, codFilial: number): EstadoPendentes | undefined {
    return this._pendentes().get(chave(ano, codFilial));
  }

  importados(ano: string, codFilial: number): EstadoImportados | undefined {
    return this._importados().get(chave(ano, codFilial));
  }

  turmas(ano: string, codFilial: number): EstadoTurmas | undefined {
    return this._turmas().get(chave(ano, codFilial));
  }

  /** Lê os alunos se ainda não vieram, falharam antes ou já estão velhos; com eles, as turmas e os pendentes. */
  garantir(ano: string, codFilial: number): void {
    const atual = this.estado(ano, codFilial);
    const lerAlunos = atual?.estado !== 'carregando' && !(atual?.estado === 'pronto' && Date.now() - atual.lidoEm < VALIDADE_MS);
    if (lerAlunos) this.ler(ano, codFilial);
    // Alunos relidos, turmas e pendentes relidos: alguém pode ter criado uma turma ou importado a
    // enturmação nesse meio-tempo.
    const turmas = this.turmas(ano, codFilial)?.estado;
    if (turmas !== 'carregando' && (lerAlunos || turmas === undefined || turmas === 'erro')) this.lerTurmas(ano, codFilial);
    const pendentes = this.pendentes(ano, codFilial)?.estado;
    if (pendentes !== 'carregando' && (lerAlunos || pendentes === undefined || pendentes === 'erro')) this.lerPendentes(ano, codFilial);
    const importados = this.importados(ano, codFilial)?.estado;
    if (importados !== 'carregando' && (lerAlunos || importados === undefined || importados === 'erro')) this.lerImportados(ano, codFilial);
  }

  /** A foto do aluno (data URL), se já chegou; null = sem foto ou ainda não veio. */
  foto(ano: string, codFilial: number, ra: string): string | null {
    return this._fotos().get(chave(ano, codFilial))?.get(ra) ?? null;
  }

  /** Pede as fotos dos RAs que ainda não foram pedidos; um RA sem foto não volta a ser pedido. */
  fotosPara(ano: string, codFilial: number, ras: readonly string[]): void {
    const k = chave(ano, codFilial);
    const pedidas = this.fotosPedidas.get(k) ?? new Set<string>();
    this.fotosPedidas.set(k, pedidas);
    const faltam = [...new Set(ras)].filter((ra) => !pedidas.has(ra));
    if (faltam.length === 0) return;
    faltam.forEach((ra) => pedidas.add(ra));
    for (let i = 0; i < faltam.length; i += FOTOS_POR_PEDIDO) {
      const lote = faltam.slice(i, i + FOTOS_POR_PEDIDO);
      this.api.getFotosEnturmacao(ano, codFilial, lote).subscribe({
        next: (fotos) =>
          this._fotos.update((m) => new Map(m).set(k, new Map([...(m.get(k) ?? []), ...Object.entries(fotos)]))),
        // Falhou: libera o lote para a próxima vez que a tela pedir. Sem foto, o avatar mostra as iniciais.
        error: () => lote.forEach((ra) => pedidas.delete(ra)),
      });
    }
  }

  /**
   * Grava os movimentos no MD de enturmação, 100 por pedido, um pedido depois do outro. Os
   * gravados já entram nos pendentes (a tela não pisca); no fim, os pendentes são relidos do RM.
   */
  salvar(ano: string, codFilial: number, movimentos: readonly { ra: string; codTurma: string }[]): Observable<ApiEnturmacaoResultadoDto[]> {
    const k = chave(ano, codFilial);
    const usuario = this.auth.currentUser()?.username ?? '';
    const lotes: { ra: string; codTurma: string }[][] = [];
    for (let i = 0; i < movimentos.length; i += MOVIMENTOS_POR_PEDIDO) lotes.push(movimentos.slice(i, i + MOVIMENTOS_POR_PEDIDO));
    return from(lotes).pipe(
      concatMap((lote) => this.api.salvarEnturmacao(usuario, ano, codFilial, lote)),
      tap((resultados) => this.aplicar(k, resultados)),
      reduce((todos, resultados) => [...todos, ...resultados], [] as ApiEnturmacaoResultadoDto[]),
      finalize(() => this.lerPendentes(ano, codFilial)),
    );
  }

  /** Relê os pendentes; enquanto relê, os que já se conheciam continuam valendo. */
  private lerPendentes(ano: string, codFilial: number): void {
    const k = chave(ano, codFilial);
    const anterior = this._pendentes().get(k);
    if (anterior?.estado !== 'pronto') this.definirPendentes(k, { estado: 'carregando' });
    const usuario = this.auth.currentUser()?.username;
    if (!usuario) {
      this.definirPendentes(k, { estado: 'erro' });
      return;
    }
    this.api.getPendentesEnturmacao(usuario, ano, codFilial).subscribe({
      next: (lista) => this.definirPendentes(k, { estado: 'pronto', porRa: new Map(lista.map((p) => [p.ra, p.codTurma])) }),
      error: () => {
        if (anterior?.estado !== 'pronto') this.definirPendentes(k, { estado: 'erro' });
      },
    });
  }

  /**
   * Relê os importados; enquanto relê, os que já se conheciam continuam valendo. Lê o período inteiro
   * no MD: por isso só junto com os alunos, não a cada gravação (essa o {@link aplicar} acompanha).
   */
  private lerImportados(ano: string, codFilial: number): void {
    const k = chave(ano, codFilial);
    const anterior = this._importados().get(k);
    if (anterior?.estado !== 'pronto') this.definirImportados(k, { estado: 'carregando' });
    const usuario = this.auth.currentUser()?.username;
    if (!usuario) {
      this.definirImportados(k, { estado: 'erro' });
      return;
    }
    this.api.getImportadosEnturmacao(usuario, ano, codFilial).subscribe({
      next: (lista) => this.definirImportados(k, { estado: 'pronto', porRa: new Map(lista.map((i) => [i.ra, i.codTurma])) }),
      error: () => {
        if (anterior?.estado !== 'pronto') this.definirImportados(k, { estado: 'erro' });
      },
    });
  }

  /** Relê as turmas; enquanto relê, as que já se conheciam continuam valendo. */
  private lerTurmas(ano: string, codFilial: number): void {
    const k = chave(ano, codFilial);
    const anterior = this._turmas().get(k);
    if (anterior?.estado !== 'pronto') this.definirTurmas(k, { estado: 'carregando' });
    this.api.getTurmasEnturmacao(ano, codFilial).subscribe({
      next: (turmas) => this.definirTurmas(k, { estado: 'pronto', turmas }),
      error: () => {
        if (anterior?.estado !== 'pronto') this.definirTurmas(k, { estado: 'erro' });
      },
    });
  }

  /**
   * O que o RM respondeu na gravação, antes de reler: pendente entra, de volta à matrícula sai. Nos
   * importados, o pendente sai; de volta à turma da matrícula, o back deixa o registro como
   * Importado, e o aluno entra com ela.
   */
  private aplicar(k: string, resultados: readonly ApiEnturmacaoResultadoDto[]): void {
    const atual = this._pendentes().get(k);
    const porRa = new Map(atual?.estado === 'pronto' ? atual.porRa : []);
    const jaImportados = this._importados().get(k);
    const importados = new Map(jaImportados?.estado === 'pronto' ? jaImportados.porRa : []);
    resultados.forEach((r) => {
      if (r.situacao === 'pendente') {
        porRa.set(r.ra, r.codTurma);
        importados.delete(r.ra);
      } else if (r.situacao === 'na-matricula') {
        porRa.delete(r.ra);
        if (r.codTurma) importados.set(r.ra, r.codTurma);
      }
    });
    this.definirPendentes(k, { estado: 'pronto', porRa });
    // Lendo ainda (ou sem leitura): a leitura em curso traz o que vale.
    if (jaImportados?.estado === 'pronto') this.definirImportados(k, { estado: 'pronto', porRa: importados });
  }

  private ler(ano: string, codFilial: number): void {
    const k = chave(ano, codFilial);
    this.definir(k, { estado: 'carregando' });
    this.api.getAlunosEnturmacao(ano, codFilial).subscribe({
      next: (alunos) => this.definir(k, { estado: 'pronto', alunos, lidoEm: Date.now() }),
      error: () => this.definir(k, { estado: 'erro' }),
    });
  }

  private definir(k: string, estado: EstadoAlunos): void {
    this._estados.update((m) => new Map(m).set(k, estado));
  }

  private definirPendentes(k: string, estado: EstadoPendentes): void {
    this._pendentes.update((m) => new Map(m).set(k, estado));
  }

  private definirImportados(k: string, estado: EstadoImportados): void {
    this._importados.update((m) => new Map(m).set(k, estado));
  }

  private definirTurmas(k: string, estado: EstadoTurmas): void {
    this._turmas.update((m) => new Map(m).set(k, estado));
  }
}

const chave = (ano: string, codFilial: number) => `${ano}|${codFilial}`;
