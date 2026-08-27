export interface RegrasOcupacao {
  areaPorAluno: number;
  pctMaximoUtilizacao: number;
  permitirExcesso: boolean;
}

export const REGRAS_PADRAO: RegrasOcupacao = {
  areaPorAluno: 1.5,
  pctMaximoUtilizacao: 90,
  permitirExcesso: true,
};
