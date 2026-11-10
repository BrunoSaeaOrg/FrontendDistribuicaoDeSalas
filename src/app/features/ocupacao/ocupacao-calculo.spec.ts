import { Sala, TurmaVinculada } from '../../core/models';
import {
  agruparEntradas,
  entradasDasSalas,
  faixaDe,
  fimDaEscala,
  FiltrosOcupacao,
  formatarPct,
  formatarVariacao,
  resumir,
} from './ocupacao-calculo';

const turma = (nome: string, alunos: number, segmento = 'Fundamental I'): TurmaVinculada => ({
  nome,
  nomeProprio: nome,
  alunos,
  codTurma: nome,
  idPerlet: 1,
  segmento,
});

const sala = (id: string, codFilial: number, capacidade: number, turnos: Sala['turnos']): Sala => ({
  id,
  unidadeId: String(codFilial),
  nome: `Sala ${id}`,
  tipo: 'Sala de aula',
  andar: '1',
  area: 45,
  carteiras: capacidade,
  capacidade,
  turnos,
  codFilial,
  codBloco: '1',
  codPredio: '1',
  codSala: id,
});

const TODAS: FiltrosOcupacao = { unidades: [], turno: 'todas', segmento: 'todas', agrupar: 'unidade' };
const nome = (id: string) => `Unidade ${id}`;
/** Filial 1 com 90% de limite, filial 2 com 50%. */
const pct = (codFilial: number) => (codFilial === 2 ? 50 : 90);

describe('ocupacao-calculo', () => {
  it('faixas pela regra: abaixo do limite, do limite até 100% e acima da capacidade', () => {
    expect(faixaDe(20, 30, 27)).toBe('disponivel');
    expect(faixaDe(27, 30, 27)).toBe('quase');
    expect(faixaDe(30, 30, 27)).toBe('quase');
    expect(faixaDe(31, 30, 27)).toBe('excedida');
    // 0,7 × 30 = 20,999...: 21 alunos já é o limite.
    expect(faixaDe(21, 30, 30 * 0.7)).toBe('quase');
    expect(faixaDe(0, 0, 0)).toBe('disponivel');
    expect(faixaDe(5, 0, 0)).toBe('excedida');
  });

  it('soma manhã e tarde e só conta as salas com turma (a regra do Mapa)', () => {
    const salas = [
      sala('A', 1, 30, { manha: [turma('3º Ano A', 25)], tarde: [turma('4º Ano A', 20)] }),
      sala('B', 1, 30, {}),
    ];
    const [g] = agruparEntradas(entradasDasSalas(salas, pct), TODAS, nome);
    expect(g.alunos).toBe(45);
    expect(g.capacidade).toBe(60);
    expect(g.ocupacao).toBeCloseTo(0.75);
    expect(g.limite).toBeCloseTo(54);
    expect(g.faixa).toBe('disponivel');

    const [manha] = agruparEntradas(entradasDasSalas(salas, pct), { ...TODAS, turno: 'manha' }, nome);
    expect(manha.ocupacao).toBeCloseTo(25 / 30);
  });

  it('o limite usa o % máximo da regra de cada unidade', () => {
    const salas = [sala('A', 1, 30, { manha: [turma('3º Ano A', 20)] }), sala('B', 2, 30, { manha: [turma('5º Ano A', 20)] })];
    const grupos = agruparEntradas(entradasDasSalas(salas, pct), TODAS, nome);
    const porUnidade = Object.fromEntries(grupos.map((g) => [g.key, g]));
    // 20 de 30 com limite de 90% (27): disponível. Com limite de 50% (15): quase lotada.
    expect(porUnidade['1'].faixa).toBe('disponivel');
    expect(porUnidade['2'].faixa).toBe('quase');
    expect(porUnidade['2'].limiteRel).toBeCloseTo(0.5);

    // Agrupando por turno, as duas unidades somam: limite 27 + 15 = 42, 40 alunos.
    const [turno] = agruparEntradas(entradasDasSalas(salas, pct), { ...TODAS, agrupar: 'turno' }, nome);
    expect(turno.limite).toBeCloseTo(42);
    expect(turno.faixa).toBe('disponivel');
  });

  it('sala dividida reparte a capacidade na proporção dos alunos', () => {
    const salas = [sala('A', 1, 30, { manha: [turma('EF3A-I', 10), turma('EF3A-M', 20)] })];
    const grupos = agruparEntradas(entradasDasSalas(salas, pct), { ...TODAS, agrupar: 'turma' }, nome);
    expect(grupos.map((g) => [g.label, g.capacidade])).toEqual([
      ['EF3A-I (Unidade 1)', 10],
      ['EF3A-M (Unidade 1)', 20],
    ]);
    expect(resumir(grupos).capacidade).toBe(30);
  });

  it('resumo conta os grupos que precisam de atenção', () => {
    const salas = [
      sala('A', 1, 30, { manha: [turma('1º Ano A', 31)] }),
      sala('B', 1, 30, { manha: [turma('2º Ano A', 28)] }),
      sala('C', 1, 30, { manha: [turma('3º Ano A', 10)] }),
    ];
    const r = resumir(agruparEntradas(entradasDasSalas(salas, pct), { ...TODAS, agrupar: 'serie' }, nome));
    expect([r.grupos, r.excedidos, r.quase]).toEqual([3, 1, 1]);
    expect(r.alunos).toBe(69);
  });

  it('formata sem esconder a passagem dos 100%', () => {
    expect(formatarPct(0.87)).toBe('87%');
    expect(formatarPct(1)).toBe('100%');
    expect(formatarPct(301 / 300)).toBe('100,3%');
    expect(formatarPct(0.996)).toBe('99,6%');
    expect(formatarVariacao(0.78, 0.85)).toBe('+7 p.p.');
    expect(formatarVariacao(0.85, 0.82)).toBe('−3 p.p.');
    expect(formatarVariacao(0.8, 0.8)).toBe('0 p.p.');
  });

  it('a escala vai até 100% ou até o próximo múltiplo de 25%', () => {
    expect(fimDaEscala(0)).toBe(1);
    expect(fimDaEscala(0.9)).toBe(1);
    expect(fimDaEscala(1)).toBe(1);
    expect(fimDaEscala(1.12)).toBe(1.25);
    expect(fimDaEscala(1.25)).toBe(1.25);
  });
});
