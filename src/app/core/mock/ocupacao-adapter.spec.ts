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
    expect(r.salas[0].turnos.manha?.codTurma).toBe('EF3A-M');
    expect(r.turmasLivres).toEqual([]);
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
