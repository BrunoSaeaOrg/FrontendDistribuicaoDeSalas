import { Turno } from './sala.model';

/** O motivo de cada turno em que a sala está indisponível no ano; turno ausente = disponível. */
export type MotivosPorTurno = Partial<Record<Turno, string>>;

/** Tamanho do campo MOTIVO no RM (varchar 500), para os dois turnos juntos. */
export const TAMANHO_MOTIVO = 500;

const ROTULO: Record<Turno, string> = { manha: 'Manhã', tarde: 'Tarde' };
const TURNOS: Turno[] = ['manha', 'tarde'];

/** "Manhã:" (com ou sem acento) ou "Tarde:" no começo da linha. */
const LINHA_DO_TURNO = /^\s*(manh[ãa]|tarde)\s*:\s*(.*)$/iu;

/** O motivo numa linha só, sem espaços repetidos: a quebra de linha separa os turnos no RM. */
export function normalizarMotivo(motivo: string | null | undefined): string {
  return (motivo ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Lê o MOTIVO do RM: uma linha por turno ("Manhã: Em reforma", "Tarde: Reservada"). Um texto sem
 * turno na primeira linha é de antes da divisão por turno e vale para o dia todo. É a mesma regra
 * do back (MotivoPorTurno), que junta o turno gravado com o outro.
 */
export function lerMotivos(motivo: string | null | undefined): MotivosPorTurno {
  const linhas = (motivo ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (linhas.length === 0) return {};
  if (!LINHA_DO_TURNO.test(linhas[0])) {
    const dia = normalizarMotivo(linhas.join(' '));
    return { manha: dia, tarde: dia };
  }
  const motivos: MotivosPorTurno = {};
  let atual: Turno | null = null;
  for (const linha of linhas) {
    const achou = LINHA_DO_TURNO.exec(linha);
    if (achou) {
      atual = /^t/i.test(achou[1]) ? 'tarde' : 'manha';
      motivos[atual] = normalizarMotivo(achou[2]);
    } else if (atual) {
      // Linha sem rótulo continua o motivo do turno de cima.
      motivos[atual] = normalizarMotivo(`${motivos[atual]} ${linha}`);
    }
  }
  TURNOS.forEach((t) => {
    if (!motivos[t]) delete motivos[t];
  });
  return motivos;
}

/** Monta o MOTIVO: uma linha por turno indisponível, manhã antes; nenhum = null. */
export function juntarMotivos(motivos: MotivosPorTurno): string | null {
  const linhas = TURNOS.filter((t) => normalizarMotivo(motivos[t])).map((t) => `${ROTULO[t]}: ${normalizarMotivo(motivos[t])}`);
  return linhas.length ? linhas.join('\n') : null;
}

/** Quantos caracteres cabem no motivo do turno, depois dos rótulos e do motivo do outro turno. */
export function espacoParaMotivo(motivos: MotivosPorTurno, turno: Turno): number {
  const comVazio = juntarMotivos({ ...motivos, [turno]: 'x' })!;
  return Math.max(TAMANHO_MOTIVO - (comVazio.length - 1), 0);
}
