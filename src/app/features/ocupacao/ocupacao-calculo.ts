import { Sala, Turno, unidadeNoFiltro } from '../../core/models';
import { serieDaTurma } from '../../core/services/salas.service';

/**
 * Cálculo do Mapa de Ocupação, sem Angular: o mesmo para o ano em uso e para os anos da aba
 * "Comparar anos". A regra é a de docs/ocupacao-nos-graficos.md:
 * - alunos = os das turmas vinculadas às salas;
 * - base = a capacidade cadastrada só das salas com turma, uma vez por turno que tem turma (em
 *   "Todos os turnos", manhã e tarde somam);
 * - sala dividida entre turmas reparte a capacidade na proporção dos alunos.
 * As faixas são as das Regras de ocupação, como no Painel e na Planta.
 */

export type Agrupador = 'unidade' | 'turno' | 'segmento' | 'serie' | 'turma';
export type FaixaOcupacao = 'disponivel' | 'quase' | 'excedida';

export const TURNOS: Turno[] = ['manha', 'tarde'];

export const FAIXAS: Record<FaixaOcupacao, { rotulo: string; tom: 'success' | 'warning' | 'danger'; icone: string }> = {
  disponivel: { rotulo: 'Disponível', tom: 'success', icone: 'check_circle' },
  quase: { rotulo: 'Quase lotada', tom: 'warning', icone: 'warning' },
  excedida: { rotulo: 'Excedida', tom: 'danger', icone: 'report' },
};

export interface EntradaOcupacao {
  unidadeId: string;
  turno: Turno;
  segmento: string;
  serie: string;
  turma: string;
  alunos: number;
  /** A parte da capacidade da sala que cabe à turma (fracionária quando a sala é dividida). */
  capacidade: number;
  /** Capacidade × % máximo de utilização da regra da unidade. */
  limite: number;
}

export interface FiltrosOcupacao {
  unidades: readonly string[];
  turno: 'todas' | Turno;
  segmento: string;
  agrupar: Agrupador;
}

export interface GrupoOcupacao {
  key: string;
  label: string;
  /** Unidade do grupo (só no agrupamento por unidade e por turma); null nos demais. */
  unidadeId: string | null;
  alunos: number;
  capacidade: number;
  limite: number;
  /** alunos ÷ capacidade (1 = 100%). */
  ocupacao: number;
  /** limite ÷ capacidade: onde começa "Quase lotada". */
  limiteRel: number;
  faixa: FaixaOcupacao;
}

export interface ResumoOcupacao {
  alunos: number;
  capacidade: number;
  limite: number;
  ocupacao: number;
  limiteRel: number;
  faixa: FaixaOcupacao;
  grupos: number;
  excedidos: number;
  quase: number;
}

/** Uma entrada por turma em cada turno de cada sala. */
export function entradasDasSalas(salas: readonly Sala[], pctDaFilial: (codFilial: number) => number): EntradaOcupacao[] {
  const lista: EntradaOcupacao[] = [];
  salas.forEach((s) => {
    const pct = pctDaFilial(s.codFilial) / 100;
    TURNOS.forEach((turno) => {
      const turmas = s.turnos[turno] ?? [];
      const alunosNaSala = turmas.reduce((total, t) => total + t.alunos, 0);
      turmas.forEach((t) => {
        // Turmas que dividem a sala dividem a capacidade dela, na proporção dos alunos: somadas
        // por unidade ou turno, a sala conta uma vez só.
        const capacidade =
          turmas.length === 1
            ? s.capacidade
            : alunosNaSala > 0
              ? (s.capacidade * t.alunos) / alunosNaSala
              : s.capacidade / turmas.length;
        lista.push({
          unidadeId: s.unidadeId,
          turno,
          segmento: t.segmento,
          serie: serieDaTurma(t.nome),
          turma: t.nomeProprio || t.nome,
          alunos: t.alunos,
          capacidade,
          limite: capacidade * pct,
        });
      });
    });
  });
  return lista;
}

/**
 * A faixa pela regra: acima da capacidade é Excedida; do limite da regra até a capacidade, Quase
 * lotada. A margem de 1e-9 segura contas como 0,7 × 30 = 20,999...
 */
export function faixaDe(alunos: number, capacidade: number, limite: number): FaixaOcupacao {
  if (capacidade <= 0) return alunos > 0 ? 'excedida' : 'disponivel';
  if (alunos > capacidade + 1e-9) return 'excedida';
  if (alunos >= limite - 1e-9) return 'quase';
  return 'disponivel';
}

const ROTULO_TURNO: Record<Turno, string> = { manha: 'Manhã', tarde: 'Tarde' };

export function agruparEntradas(
  entradas: readonly EntradaOcupacao[],
  filtros: FiltrosOcupacao,
  nomeDaUnidade: (unidadeId: string) => string,
): GrupoOcupacao[] {
  const chave = (e: EntradaOcupacao): { key: string; label: string; unidadeId: string | null } => {
    switch (filtros.agrupar) {
      case 'unidade':
        return { key: e.unidadeId, label: nomeDaUnidade(e.unidadeId), unidadeId: e.unidadeId };
      case 'turno':
        return { key: e.turno, label: ROTULO_TURNO[e.turno], unidadeId: null };
      case 'segmento':
        return { key: e.segmento, label: e.segmento || 'Sem segmento', unidadeId: null };
      case 'serie':
        return { key: e.serie, label: e.serie, unidadeId: null };
      default:
        // Pela unidade: a mesma turma em duas unidades (ex.: CASJ 1 e CASJ 2) não é a mesma turma.
        return {
          key: `${e.unidadeId}|${e.turma}`,
          label: `${e.turma} (${nomeDaUnidade(e.unidadeId)})`,
          unidadeId: e.unidadeId,
        };
    }
  };

  const mapa = new Map<string, { key: string; label: string; unidadeId: string | null; alunos: number; capacidade: number; limite: number }>();
  entradas
    .filter(
      (e) =>
        unidadeNoFiltro(filtros.unidades, e.unidadeId) &&
        (filtros.turno === 'todas' || e.turno === filtros.turno) &&
        (filtros.segmento === 'todas' || e.segmento === filtros.segmento),
    )
    .forEach((e) => {
      const k = chave(e);
      const g = mapa.get(k.key);
      if (g) {
        g.alunos += e.alunos;
        g.capacidade += e.capacidade;
        g.limite += e.limite;
      } else {
        mapa.set(k.key, { ...k, alunos: e.alunos, capacidade: e.capacidade, limite: e.limite });
      }
    });

  return Array.from(mapa.values()).map((g) => ({
    ...g,
    ocupacao: g.capacidade > 0 ? g.alunos / g.capacidade : 0,
    limiteRel: g.capacidade > 0 ? g.limite / g.capacidade : 0,
    faixa: faixaDe(g.alunos, g.capacidade, g.limite),
  }));
}

export function resumir(grupos: readonly GrupoOcupacao[]): ResumoOcupacao {
  const alunos = grupos.reduce((a, g) => a + g.alunos, 0);
  const capacidade = grupos.reduce((a, g) => a + g.capacidade, 0);
  const limite = grupos.reduce((a, g) => a + g.limite, 0);
  return {
    alunos,
    capacidade,
    limite,
    ocupacao: capacidade > 0 ? alunos / capacidade : 0,
    limiteRel: capacidade > 0 ? limite / capacidade : 0,
    faixa: faixaDe(alunos, capacidade, limite),
    grupos: grupos.length,
    excedidos: grupos.filter((g) => g.faixa === 'excedida').length,
    quase: grupos.filter((g) => g.faixa === 'quase').length,
  };
}

const NUMERO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** 1234 → "1.234". A capacidade de uma sala dividida é fracionária: arredonda só para mostrar. */
export function formatarNumero(n: number): string {
  return NUMERO.format(Math.round(n));
}

/**
 * 0,87 → "87%". Perto de 100% mostra uma casa: 100,4% (acima da capacidade) não pode aparecer
 * como "100%", nem 99,6% como se tivesse lotado.
 */
export function formatarPct(ocupacao: number): string {
  const v = ocupacao * 100;
  const r = Math.round(v);
  if (r === 100 && Math.abs(v - 100) > 1e-9) return `${v.toFixed(1).replace('.', ',')}%`;
  return `${r}%`;
}

/** Diferença em pontos percentuais: +7 p.p., −3 p.p., 0 p.p. */
export function formatarVariacao(de: number, para: number): string {
  const pp = Math.round((para - de) * 100);
  if (pp === 0) return '0 p.p.';
  return `${pp > 0 ? '+' : '−'}${Math.abs(pp)} p.p.`;
}

/** Fim da escala do gráfico: pelo menos 100%, e acima disso o próximo múltiplo de 25%. */
export function fimDaEscala(maiorOcupacao: number): number {
  return Math.max(1, Math.ceil(maiorOcupacao * 4 - 1e-9) / 4);
}
