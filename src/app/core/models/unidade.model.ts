/** Uma filial do RM: cada filial é uma unidade ("CASJ · filial 2"), com o CODFILIAL como id. */
export interface Unidade {
  id: string;
  nome: string;
  cor: string;
  codFilial: number;
}
