import { espacoParaMotivo, juntarMotivos, lerMotivos, TAMANHO_MOTIVO } from './indisponibilidade';

describe('Motivo de indisponibilidade por turno', () => {
  it('lê uma linha por turno, com ou sem acento e em qualquer caixa', () => {
    expect(lerMotivos('manha:  Em reforma\r\nTARDE: Reservada')).toEqual({ manha: 'Em reforma', tarde: 'Reservada' });
    expect(lerMotivos('Tarde: Reservada\npara o reforço')).toEqual({ tarde: 'Reservada para o reforço' });
  });

  it('vazio é disponível; texto sem turno (de antes) vale para os dois', () => {
    expect(lerMotivos(null)).toEqual({});
    expect(lerMotivos('  \n ')).toEqual({});
    expect(lerMotivos('Em reforma\naté março')).toEqual({ manha: 'Em reforma até março', tarde: 'Em reforma até março' });
  });

  it('junta com a manhã antes, uma linha por turno, e lê de volta o mesmo', () => {
    const junto = juntarMotivos({ tarde: 'Reservada', manha: 'Em  reforma' });
    expect(junto).toBe('Manhã: Em reforma\nTarde: Reservada');
    expect(lerMotivos(junto)).toEqual({ manha: 'Em reforma', tarde: 'Reservada' });
    expect(juntarMotivos({})).toBeNull();
  });

  it('o espaço do motivo de um turno desconta os rótulos e o outro turno', () => {
    // Só "Manhã: " (7) antes do motivo.
    expect(espacoParaMotivo({}, 'manha')).toBe(TAMANHO_MOTIVO - 7);
    // "Manhã: " + "\n" + "Tarde: Reservada" (16).
    expect(espacoParaMotivo({ tarde: 'Reservada' }, 'manha')).toBe(TAMANHO_MOTIVO - 7 - 1 - 16);
    // O motivo atual do próprio turno não conta: vai ser trocado.
    expect(espacoParaMotivo({ manha: 'x'.repeat(300) }, 'manha')).toBe(TAMANHO_MOTIVO - 7);
  });
});
