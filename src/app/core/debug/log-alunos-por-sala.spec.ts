import { ApiSalaDto, ApiTurmaDto, ApiTurmaXSalaDto } from '../models/ocupacao-api.model';
import { linhasDeAlunos } from './log-alunos-por-sala';

const turma = (codTurma: string, ocupacao: number, extra: Partial<ApiTurmaDto> = {}): ApiTurmaDto => ({
  ANOLETIVO: '2026',
  IDPERLET: 222,
  CODFILIAL: 2,
  UNIDADE: 'CASJ',
  SEGMENTO: 'EF',
  CODTURMA: codTurma,
  TURMA: codTurma,
  TURNO: 'Manhã',
  OCUPACAO: ocupacao,
  ...extra,
});

// Como o RM devolve: só os códigos da sala, sem o nome (SALA).
const vinculo = (codSala: string, codTurma: string, composicao?: string): ApiTurmaXSalaDto =>
  ({
    CODFILIAL: 2,
    UNIDADE: 'CASJ',
    CODBLOCO: '1',
    CODPREDIO: '1',
    CODSALA: codSala,
    ANOLETIVO: '2026',
    IDPERLET: 222,
    CODTURMA: codTurma,
    OCUPACAO: 0,
    COMPOSICAO: composicao,
  }) as ApiTurmaXSalaDto;

const sala = (codSala: string, nome: string) =>
  ({ CODFILIAL: 2, CODBLOCO: '1', CODPREDIO: '1', CODSALA: codSala, SALA: nome }) as ApiSalaDto;

describe('linhasDeAlunos', () => {
  it('põe cada subturma na sala da COMPOSICAO, com os alunos dela, e deixa as sem sala por último', () => {
    const linhas = linhasDeAlunos(
      [turma('EF3A-M', 18), turma('EF3A-SM', 5), turma('EF4B-T', 0, { TURNO: 'Tarde', CODFILIAL: 13, IDPERLET: 223 })],
      [vinculo('2', 'EF3A-M', 'EF3A-M (18) + EF3A-SM (5)'), vinculo('', 'EF5C-M')],
      [sala('2', 'Sala 2')],
    );
    expect(linhas.map((l) => [l.filial, l.sala, l.codigo, l.alunos])).toEqual([
      [2, 'Sala 2', 'EF3A-M', 18],
      [2, 'Sala 2', 'EF3A-SM', 5],
      [13, '', 'EF4B-T', 0],
    ]);
  });

  it('turma que só aparece no vínculo entra com os alunos da COMPOSICAO; sala sem nome sai pelos códigos', () => {
    const [linha] = linhasDeAlunos([], [vinculo('7', 'EF1A-M', 'EF1A-M (20)')]);
    expect(linha).toMatchObject({ sala: 'Sala 7 (bloco 1, prédio 1)', codigo: 'EF1A-M', alunos: 20 });
  });
});
