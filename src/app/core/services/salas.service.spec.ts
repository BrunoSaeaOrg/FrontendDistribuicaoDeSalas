import { serieDaTurma } from './salas.service';

describe('serieDaTurma', () => {
  it('junta as grafias do mesmo ano do Fundamental, com turma e turno', () => {
    expect(['6º ANO A', '6º Ano B', '6º ano C - Manhã', '6º Ano A - Semi-Manhã'].map(serieDaTurma)).toEqual([
      '6º Ano',
      '6º Ano',
      '6º Ano',
      '6º Ano',
    ]);
    expect(serieDaTurma('4º ano K - Semi Trade')).toBe('4º Ano');
  });

  it('junta as grafias do Infantil, com a letra colada ou depois do turno', () => {
    expect(
      ['INFANTIL 2', 'Infantil 2A', 'Infantil 2 - Semi Manhã A', 'Infantil 2 - Integral Manhã', 'Infantil 2 - Tarde D'].map(
        serieDaTurma,
      ),
    ).toEqual(['Infantil 2', 'Infantil 2', 'Infantil 2', 'Infantil 2', 'Infantil 2']);
  });

  it('o Ensino Médio fica como série', () => {
    expect(['1ª SÉRIE A', '1ª Série EM', '1ª série B - Tarde'].map(serieDaTurma)).toEqual([
      '1ª Série',
      '1ª Série',
      '1ª Série',
    ]);
  });

  it('nome fora dos padrões perde só o turno e a letra da turma', () => {
    expect(serieDaTurma('Berçário B - Integral')).toBe('Berçário');
  });
});
