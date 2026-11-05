/**
 * Uma filial do RM: cada filial é uma unidade, com o CODFILIAL como id. O nome não leva a palavra
 * "filial": unidades com o mesmo nome no RM são numeradas ("CASJ 1", "CASJ 2"); nome único fica só
 * o nome.
 */
export interface Unidade {
  id: string;
  nome: string;
  cor: string;
  codFilial: number;
}

/**
 * O campo Unidade das telas marca várias unidades (checkbox). Nas telas que filtram, nenhuma
 * marcada vale como todas.
 */
export function unidadeNoFiltro(marcadas: readonly string[], unidadeId: string): boolean {
  return marcadas.length === 0 || marcadas.includes(unidadeId);
}
