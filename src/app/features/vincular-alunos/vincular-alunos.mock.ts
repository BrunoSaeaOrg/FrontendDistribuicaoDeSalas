/**
 * Dados fictícios do protótipo "Vincular aluno à turma": ainda não há consulta no RM de alunos
 * por turma. Nomes e matrículas são gerados a partir da posição, então são sempre os mesmos.
 * Quando a consulta existir, só este arquivo sai: a tela recebe as mesmas formas.
 */

export interface AlunoMock {
  id: string;
  nome: string;
  matricula: string;
}

export interface SalaMock {
  id: string;
  nome: string;
  unidade: string;
  andar: string;
  /** As turmas da sala (uma por turno) dividem estas carteiras. */
  carteiras: number;
}

export interface TurmaMock {
  id: string;
  nome: string;
  turno: 'Manhã' | 'Tarde';
  segmento: string;
  salaId: string;
}

/** Chave dos alunos do ano ainda sem turma (ex.: matriculados agora). */
export const SEM_TURMA = 'sem-turma';

export const ANOS_LETIVOS_MOCK = ['2025', '2026'];

const NOMES = [
  'Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Heitor', 'Isabela', 'João',
  'Laura', 'Lucas', 'Manuela', 'Miguel', 'Nicole', 'Otávio', 'Pedro', 'Rafaela', 'Samuel', 'Sofia',
  'Thiago', 'Valentina', 'Vinícius', 'Yasmin', 'Arthur', 'Beatriz', 'Davi', 'Helena', 'Lorenzo',
  'Alice', 'Bernardo', 'Cecília', 'Enzo', 'Lívia', 'Matheus', 'Giovanna',
];
const SOBRENOMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Rodrigues',
  'Almeida', 'Nascimento', 'Carvalho', 'Gomes', 'Martins', 'Araújo', 'Ribeiro', 'Barbosa', 'Rocha',
  'Dias', 'Moreira', 'Teixeira', 'Cardoso', 'Mendes', 'Freitas', 'Castro', 'Pinto', 'Correia', 'Campos',
];

/** [código, nome, unidade, andar, carteiras] */
type SalaInicial = [string, string, string, string, number];
/** [código, nome, turno, segmento, código da sala, alunos já na turma] */
type TurmaInicial = [string, string, TurmaMock['turno'], string, string, number];

const DADOS_INICIAIS: Record<string, { salas: SalaInicial[]; turmas: TurmaInicial[]; semTurma: number }> = {
  '2025': {
    salas: [
      ['S12', 'Sala 12', 'CASJ', '1º andar', 30],
      ['S13', 'Sala 13', 'CASJ', '1º andar', 30],
    ],
    turmas: [
      ['1A', '1º Ano A', 'Manhã', 'Anos Iniciais', 'S12', 28],
      ['1B', '1º Ano B', 'Tarde', 'Anos Iniciais', 'S12', 24],
      ['2A', '2º Ano A', 'Manhã', 'Anos Iniciais', 'S13', 27],
      ['2B', '2º Ano B', 'Tarde', 'Anos Iniciais', 'S13', 21],
    ],
    semTurma: 6,
  },
  '2026': {
    salas: [
      ['S12', 'Sala 12', 'CASJ', '1º andar', 30],
      ['S13', 'Sala 13', 'CASJ', '1º andar', 30],
      ['S21', 'Sala 21', 'CASJ', '2º andar', 35],
    ],
    turmas: [
      ['1A', '1º Ano A', 'Manhã', 'Anos Iniciais', 'S12', 26],
      ['1C', '1º Ano C', 'Tarde', 'Anos Iniciais', 'S12', 18],
      ['1B', '1º Ano B', 'Manhã', 'Anos Iniciais', 'S13', 29],
      ['2B', '2º Ano B', 'Tarde', 'Anos Iniciais', 'S13', 22],
      ['6A', '6º Ano A', 'Manhã', 'Anos Finais', 'S21', 31],
      ['7A', '7º Ano A', 'Tarde', 'Anos Finais', 'S21', 27],
    ],
    semTurma: 14,
  },
};

/** Alunos em ordem de nome; numa turma (até 36 seguidos) o primeiro nome não se repete. */
function gerarAlunos(ano: string, quantidade: number, inicio: number): AlunoMock[] {
  return Array.from({ length: quantidade }, (_, i) => {
    const n = inicio + i;
    const nome = `${NOMES[(n * 7) % NOMES.length]} ${SOBRENOMES[(n * 5) % SOBRENOMES.length]} ${SOBRENOMES[(n * 11 + 3) % SOBRENOMES.length]}`;
    return { id: `${ano}-${n}`, nome, matricula: `${ano}${String(n + 1).padStart(4, '0')}` };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export const SALAS_MOCK: Record<string, SalaMock[]> = Object.fromEntries(
  Object.entries(DADOS_INICIAIS).map(([ano, { salas }]) => [
    ano,
    salas.map(([codigo, nome, unidade, andar, carteiras]) => ({ id: `${ano}-${codigo}`, nome, unidade, andar, carteiras })),
  ]),
);

export const TURMAS_MOCK: Record<string, TurmaMock[]> = Object.fromEntries(
  Object.entries(DADOS_INICIAIS).map(([ano, { turmas }]) => [
    ano,
    turmas.map(([codigo, nome, turno, segmento, sala]) => ({ id: `${ano}-${codigo}`, nome, turno, segmento, salaId: `${ano}-${sala}` })),
  ]),
);

/** Alunos de cada turma do ano (e os sem turma, em SEM_TURMA). */
export const ALUNOS_MOCK: Record<string, Record<string, AlunoMock[]>> = Object.fromEntries(
  Object.entries(DADOS_INICIAIS).map(([ano, { turmas, semTurma }]) => {
    let proximo = 0;
    const porTurma: Record<string, AlunoMock[]> = {};
    turmas.forEach(([codigo, , , , , alunos]) => {
      porTurma[`${ano}-${codigo}`] = gerarAlunos(ano, alunos, proximo);
      proximo += alunos;
    });
    porTurma[SEM_TURMA] = gerarAlunos(ano, semTurma, proximo);
    return [ano, porTurma];
  }),
);
