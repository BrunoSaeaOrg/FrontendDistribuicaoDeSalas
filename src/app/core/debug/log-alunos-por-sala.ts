import { lerComposicao, temSala } from '../mock/ocupacao-adapter';
import { ApiSalaDto, ApiTurmaDto, ApiTurmaXSalaDto } from '../models/ocupacao-api.model';

/**
 * DEBUG temporário: mostra no console quantos alunos tem cada turma e em que sala ela está, por ano
 * letivo e filial. Os alunos vêm de OC_SAL_TURMAS (OCUPACAO de cada turma) e a sala vem de
 * OC_SAL_TURMASXSALAS, em que a COMPOSICAO diz quais subturmas estão em cada sala. Os dados são
 * os crus do RM, sem o filtro de período que a tela aplica, então aparecem todas as filiais.
 * OC_SAL_TURMASXSALAS só traz os códigos da sala: o nome vem de OC_SAL_SALAS_ANO, que só tem as
 * filiais com período no ano; sala fora dela aparece pelos códigos.
 */

export interface LinhaAlunos {
  filial: number;
  unidade: string;
  periodoLetivo: number;
  /** Vazio = turma sem sala. */
  sala: string;
  turno: string;
  turma: string;
  codigo: string;
  alunos: number;
}

export interface AlunosDoAno {
  ano: string;
  linhas: LinhaAlunos[];
}

const chave = (codTurma: string, idPerlet: number) => `${codTurma}|${idPerlet}`;
const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
const chaveSala = (s: Pick<ApiSalaDto, 'CODFILIAL' | 'CODBLOCO' | 'CODPREDIO' | 'CODSALA'>) =>
  `${s.CODFILIAL}-${s.CODBLOCO}-${s.CODPREDIO}-${s.CODSALA}`;

/** Uma linha por turma (subturma), com a sala em que ela está e os alunos dela. */
export function linhasDeAlunos(
  turmas: ApiTurmaDto[],
  vinculos: ApiTurmaXSalaDto[],
  salas: ApiSalaDto[] = [],
): LinhaAlunos[] {
  const nomes = new Map(salas.map((s) => [chaveSala(s), s.SALA]));
  const nomeDaSala = (v: ApiTurmaXSalaDto): string =>
    nomes.get(chaveSala(v)) || `Sala ${v.CODSALA} (bloco ${v.CODBLOCO}, prédio ${v.CODPREDIO})`;
  const linhas = new Map<string, LinhaAlunos>();
  turmas.forEach((t) =>
    linhas.set(chave(t.CODTURMA, t.IDPERLET), {
      filial: t.CODFILIAL,
      unidade: t.UNIDADE ?? '',
      periodoLetivo: t.IDPERLET,
      sala: '',
      turno: t.TURNO ?? '',
      turma: t.TURMA ?? t.CODTURMA,
      codigo: t.CODTURMA,
      alunos: t.OCUPACAO ?? 0,
    }),
  );

  vinculos.filter(temSala).forEach((v) => {
    const sala = nomeDaSala(v);
    const partes = lerComposicao(v.COMPOSICAO);
    (partes.length > 0 ? partes : [{ codTurma: v.CODTURMA, alunos: v.OCUPACAO }]).forEach((parte) => {
      const linha = linhas.get(chave(parte.codTurma, v.IDPERLET));
      if (linha) {
        if (!linha.sala.split(' + ').includes(sala)) linha.sala = linha.sala ? `${linha.sala} + ${sala}` : sala;
        return;
      }
      // Turma que está numa sala mas não veio na lista de turmas: os alunos são os da COMPOSICAO.
      linhas.set(chave(parte.codTurma, v.IDPERLET), {
        filial: v.CODFILIAL,
        unidade: v.UNIDADE ?? '',
        periodoLetivo: v.IDPERLET,
        sala,
        turno: v.TURNO ?? '',
        turma: parte.codTurma,
        codigo: parte.codTurma,
        alunos: parte.alunos,
      });
    });
  });

  // Sem sala por último; dentro da sala, por turno e turma.
  return [...linhas.values()].sort(
    (a, b) =>
      a.filial - b.filial ||
      Number(!a.sala) - Number(!b.sala) ||
      porNome(a.sala, b.sala) ||
      porNome(a.turno, b.turno) ||
      porNome(a.turma, b.turma),
  );
}

const somaAlunos = (linhas: LinhaAlunos[]) => linhas.reduce((total, l) => total + l.alunos, 0);

/** Um resumo por ano e filial e, embaixo, a tabela de turmas de cada filial (recolhida). */
export function logAlunosPorSala(anos: AlunosDoAno[]): void {
  const filiais = [...new Set(anos.flatMap((a) => a.linhas.map((l) => l.filial)))].sort((a, b) => a - b);

  console.group(`Alunos por sala e turma (${anos.map((a) => a.ano).join(' e ')})`);
  console.table(
    anos.flatMap(({ ano, linhas }) =>
      filiais.map((filial) => {
        const daFilial = linhas.filter((l) => l.filial === filial);
        return {
          Ano: ano,
          Filial: filial,
          Unidade: daFilial[0]?.unidade ?? '',
          'Período letivo': [...new Set(daFilial.map((l) => l.periodoLetivo))].join(', ') || '—',
          Turmas: daFilial.length,
          'Em sala': daFilial.filter((l) => l.sala).length,
          'Sem sala': daFilial.filter((l) => !l.sala).length,
          Alunos: somaAlunos(daFilial),
        };
      }),
    ),
  );

  anos.forEach(({ ano, linhas }) =>
    filiais.forEach((filial) => {
      const daFilial = linhas.filter((l) => l.filial === filial);
      if (daFilial.length === 0) {
        console.log(`${ano} · filial ${filial}: nenhuma turma`);
        return;
      }
      console.groupCollapsed(
        `${ano} · filial ${filial} (${daFilial[0].unidade}) · ${daFilial.length} turmas · ${somaAlunos(daFilial)} alunos`,
      );
      console.table(
        daFilial.map((l) => ({
          Sala: l.sala || '(sem sala)',
          Turno: l.turno,
          Turma: l.turma,
          Código: l.codigo,
          Alunos: l.alunos,
        })),
      );
      console.groupEnd();
    }),
  );
  console.groupEnd();
}
