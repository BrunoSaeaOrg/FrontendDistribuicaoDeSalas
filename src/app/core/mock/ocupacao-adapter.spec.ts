import { ApiSalaDto, ApiTurmaDto, ApiTurmaXSalaDto } from '../models/ocupacao-api.model';
import { fundirSalasEApi } from './ocupacao-adapter';

function sala(codSala: string, codFilial = 2): ApiSalaDto {
  return {
    CODFILIAL: codFilial,
    FILIAL: 'CASJ',
    CODBLOCO: '1',
    CODPREDIO: '1',
    CODTIPOSALA: 1,
    TIPOSALA: 'Sala de aula',
    CODSALA: codSala,
    SALA: `Sala ${codSala}`,
    ANDAR: '1',
    CARTEIRAS: 30,
    CAPACIDADE: 30,
    CAPACIDADEMAXIMA: 32,
    AREA: 45,
  };
}

function turma(codTurma: string, turno = 'Manhã', codFilial = 2, unidade = 'CASJ'): ApiTurmaDto {
  return {
    ANOLETIVO: '2026',
    IDPERLET: 222,
    CODFILIAL: codFilial,
    UNIDADE: unidade,
    SEGMENTO: 'Anos Iniciais',
    CODTURMA: codTurma,
    TURMA: `${codTurma} - ${turno}`,
    TURNO: turno,
    OCUPACAO: 25,
  };
}

/** Linha de OC_SAL_TURMASXSALAS. Sem `codSala`, é como o RM devolve a turma sem sala. */
function vinculo(t: ApiTurmaDto, codSala = ''): ApiTurmaXSalaDto {
  return {
    ...sala(codSala, t.CODFILIAL),
    ...t,
    CODBLOCO: codSala ? '1' : '',
    CODPREDIO: codSala ? '1' : '',
    CODSALA: codSala,
  } as ApiTurmaXSalaDto;
}

describe('fundirSalasEApi', () => {
  it('turma com sala fica no turno da sala e não aparece como livre', () => {
    const t = turma('EF3A-M');

    const r = fundirSalasEApi([sala('12')], [vinculo(t, '12')], [t]);

    expect(r.salas).toHaveLength(1);
    expect(r.salas[0].turnos.manha?.map((x) => x.codTurma)).toEqual(['EF3A-M']);
    expect(r.turmasLivres).toEqual([]);
  });

  it('leva o andar da sala, sem espaços sobrando', () => {
    const r = fundirSalasEApi([sala('12'), { ...sala('13'), ANDAR: 'T ' }], [], []);
    expect(r.salas.map((s) => s.andar)).toEqual(['1', 'T']);
  });

  it('duas turmas na mesma sala e turno ficam as duas, em ordem de nome e sem repetir', () => {
    const b = turma('EF3B-M');
    const a = turma('EF3A-M');

    const r = fundirSalasEApi([sala('12')], [vinculo(b, '12'), vinculo(a, '12'), vinculo(b, '12')], [a, b]);

    expect(r.salas[0].turnos.manha?.map((x) => x.codTurma)).toEqual(['EF3A-M', 'EF3B-M']);
    expect(r.turmasLivres).toEqual([]);
  });

  it('subturmas vinculadas (linha só com COMPOSICAO, sem TURNO) aparecem todas, com nome e turno próprios', () => {
    // Como o RM devolve três semi-manhã vinculadas à Sala 1: uma linha por turma-mãe, sem TURMA/TURNO.
    const maes = ['EF3A-M', 'EF3B-M', 'EF4F-M'].map((cod) => turma(cod));
    const semis = ['EF3A-SM', 'EF3B-SM', 'EF4F-SM'].map((cod, i) => ({
      ...turma(cod),
      TURMA: `${cod} - Semi-Manhã`,
      OCUPACAO: i + 3,
    }));
    const linhas = maes.map((mae, i) => ({
      ...vinculo(mae, '1'),
      TURMA: undefined,
      TURNO: undefined,
      SEGMENTO: undefined,
      OCUPACAO: i + 3,
      COMPOSICAO: `${semis[i].CODTURMA} (${i + 3})`,
    }));

    const r = fundirSalasEApi([sala('1')], [...maes.map((m) => vinculo(m)), ...linhas], [...maes, ...semis]);

    expect(r.salas[0].turnos.manha?.map((x) => `${x.codTurma}/${x.nome}/${x.alunos}`)).toEqual([
      'EF3A-SM/EF3A-SM - Semi-Manhã/3',
      'EF3B-SM/EF3B-SM - Semi-Manhã/4',
      'EF4F-SM/EF4F-SM - Semi-Manhã/5',
    ]);
    // As semi vinculadas saem das livres; as turmas-mães (sem sala) continuam livres.
    expect(r.turmasLivres.map((x) => x.codTurma).sort()).toEqual(['EF3A-M', 'EF3B-M', 'EF4F-M']);
  });

  it('integral junto da turma principal fica no turno dela, como turma própria', () => {
    const mae = turma('EF3B-M');
    const integral = { ...turma('EF3B-I', 'Integral'), TURMA: '3º Ano B - Integral', OCUPACAO: 2 };
    const linha = { ...vinculo(mae, '13'), OCUPACAO: 23, COMPOSICAO: 'EF3B-I (2) + EF3B-M (21)' };

    const r = fundirSalasEApi([sala('13')], [linha], [mae, integral]);

    expect(r.salas[0].turnos.manha?.map((x) => [x.codTurma, x.alunos])).toEqual([
      ['EF3B-I', 2],
      ['EF3B-M', 21],
    ]);
    expect(r.turmasLivres).toEqual([]);
  });

  it('integral sozinha na sala (linha sem TURNO) fica no turno da turma-mãe achada pelo código', () => {
    const mae = { ...turma('EF3H-T', 'Tarde') };
    const integral = { ...turma('EF3H-I', 'Integral'), TURMA: '3º Ano H - Integral', OCUPACAO: 2 };
    const linha = { ...vinculo(mae, '14'), TURMA: undefined, TURNO: undefined, OCUPACAO: 2, COMPOSICAO: 'EF3H-I (2)' };

    const r = fundirSalasEApi([sala('14')], [vinculo(mae), linha], [mae, integral]);

    expect(r.salas[0].turnos.tarde?.map((x) => x.codTurma)).toEqual(['EF3H-I']);
    expect(r.turmasLivres.map((x) => `${x.codTurma}/${x.turno}`)).toEqual(['EF3H-T/tarde']);
  });

  it('integral sem sala é livre no turno da turma-mãe, para poder ser vinculada de novo', () => {
    const mae = turma('EF4F-M');
    const integral = { ...turma('EF4F-I', 'Integral'), TURMA: '4º Ano F - Integral', OCUPACAO: 3 };

    const r = fundirSalasEApi([sala('1')], [vinculo(mae), vinculo(integral)], [mae, integral]);

    expect(r.salas[0].turnos).toEqual({});
    expect(r.turmasLivres.map((x) => `${x.codTurma}/${x.turno}/${x.alunos}`).sort()).toEqual([
      'EF4F-I/manha/3',
      'EF4F-M/manha/25',
    ]);
  });

  it('linha sem sala e sem TURNO (pedaço de COMPOSICAO) não vira turma livre repetida', () => {
    const mae = turma('EF3A-M');
    const semi = { ...turma('EF3A-SM'), TURMA: '3º Ano A - Semi-Manhã', OCUPACAO: 5 };
    const pedaco = { ...vinculo(mae), TURMA: undefined, TURNO: undefined, OCUPACAO: 5, COMPOSICAO: 'EF3A-SM (5)' };

    const r = fundirSalasEApi([sala('1')], [vinculo(mae), pedaco], [mae, semi]);

    expect(r.turmasLivres.map((x) => x.codTurma).sort()).toEqual(['EF3A-M', 'EF3A-SM']);
  });

  it('linha sem sala não vira sala fantasma e a turma volta a ficar livre (ex.: recém-liberada)', () => {
    const t = turma('EF3A-M');

    const r = fundirSalasEApi([sala('12')], [vinculo(t)], [t]);

    expect(r.salas.map((s) => s.id)).toEqual(['2-1-1-12']);
    expect(r.salas[0].turnos).toEqual({});
    expect(r.turmasLivres.map((x) => x.codTurma)).toEqual(['EF3A-M']);
  });

  it('turma sem sala que só vem em TURMASXSALAS também entra como livre, sem repetir', () => {
    const naLista = turma('EF3A-M');
    const soNosVinculos = turma('EF4B-T', 'Tarde');

    const r = fundirSalasEApi([sala('12')], [vinculo(naLista), vinculo(soNosVinculos)], [naLista]);

    expect(r.turmasLivres.map((x) => `${x.codTurma}/${x.turno}`).sort()).toEqual(['EF3A-M/manha', 'EF4B-T/tarde']);
  });

  it('turma sem sala de filial onde o usuário não tem sala fica de fora (nem livre, nem unidade)', () => {
    const outraFilial = turma('EF1A-M', 'Manhã', 6, 'MENDEL');

    const r = fundirSalasEApi([sala('12')], [vinculo(outraFilial)], []);

    expect(r.turmasLivres).toEqual([]);
    expect(r.unidades.map((u) => u.nome)).toEqual(['CASJ']);
    expect(r.salas).toHaveLength(1);
  });
});
