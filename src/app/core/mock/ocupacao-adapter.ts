import { Sala, Turno, TurmaLivre, Unidade } from '../models';
import { ApiSalaDto, ApiTurmaDto, ApiTurmaXSalaDto } from '../models/ocupacao-api.model';

const CORES_UNIDADE = [
  'var(--saea-unit-casj)',
  'var(--saea-unit-liceu)',
  'var(--saea-unit-cansf)',
  'var(--saea-unit-mendel)',
  'var(--saea-unit-sta-rita-sp)',
  '#ffff00',
  'var(--saea-unit-sto-antonio)',
  'var(--saea-unit-sta-monica)',
  '#b5e6a2',
  'var(--saea-unit-d-fernando)',
  '#f2ceef',
];

function semAcentos(texto: string | null | undefined): string {
  return (texto ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function slugify(nome: string | null | undefined): string {
  return semAcentos(nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * OC_SAL_SALAS expoe o nome da unidade em FILIAL, enquanto OC_SAL_TURMASXSALAS e
 * OC_SAL_TURMAS usam UNIDADE. Aceita os dois e cai para o codigo da filial se faltarem.
 */
function nomeUnidade(dto: { UNIDADE?: string; FILIAL?: string; CODFILIAL: number }): string {
  return dto.UNIDADE?.trim() || dto.FILIAL?.trim() || `Filial ${dto.CODFILIAL}`;
}

function salaId(dto: ApiSalaDto): string {
  return `${dto.CODFILIAL}-${dto.CODBLOCO}-${dto.CODPREDIO}-${dto.CODSALA}`;
}

function mapTurno(turno: string): Turno | null {
  const normalizado = semAcentos(turno).toLowerCase().trim();
  if (normalizado === 'manha') return 'manha';
  if (normalizado === 'tarde') return 'tarde';
  console.warn(`[ocupacao-adapter] Turno desconhecido ignorado: "${turno}"`);
  return null;
}

function registrarUnidade(
  unidadesMap: Map<string, Unidade>,
  dto: { UNIDADE?: string; FILIAL?: string; CODFILIAL: number },
): void {
  const nome = nomeUnidade(dto);
  const id = slugify(nome);
  if (!id || unidadesMap.has(id)) return;
  unidadesMap.set(id, {
    id,
    nome,
    cor: CORES_UNIDADE[unidadesMap.size % CORES_UNIDADE.length],
  });
}

function criarSala(dto: ApiSalaDto): Sala {
  return {
    id: salaId(dto),
    unidadeId: slugify(nomeUnidade(dto)),
    nome: dto.SALA,
    tipo: dto.TIPOSALA,
    area: dto.AREA,
    carteiras: dto.CARTEIRAS,
    capacidade: dto.CAPACIDADE,
    turnos: {},
    codFilial: dto.CODFILIAL,
    codBloco: dto.CODBLOCO,
    codPredio: dto.CODPREDIO,
    codSala: dto.CODSALA,
  };
}

/**
 * OC_SAL_TURMASXSALAS devolve também as turmas SEM sala (CODSALA vazio): a turma recém-liberada
 * volta assim, e as de outras filiais também. Elas não são vínculo — tratá-las como vínculo
 * criava "salas" sem nome na tela (só com "Liberar") e escondia a turma da lista para vincular.
 */
function temSala(dto: ApiTurmaXSalaDto): boolean {
  return String(dto.CODSALA ?? '').trim() !== '';
}

function chaveTurma(dto: { CODTURMA: string; IDPERLET: number; TURNO: string }): string {
  return `${dto.CODTURMA}|${dto.IDPERLET}|${dto.TURNO}`;
}

export function fundirSalasEApi(
  salasDto: ApiSalaDto[],
  turmasXSalasDto: ApiTurmaXSalaDto[],
  turmasDto: ApiTurmaDto[] = [],
): { unidades: Unidade[]; salas: Sala[]; turmasLivres: TurmaLivre[] } {
  const vinculos = turmasXSalasDto.filter(temSala);
  // Turma sem sala só interessa nas filiais em que o usuário tem salas (onde ele pode vinculá-la).
  const filiaisDoUsuario = new Set(salasDto.map((dto) => dto.CODFILIAL));
  const semSala = turmasXSalasDto.filter((dto) => !temSala(dto) && filiaisDoUsuario.has(dto.CODFILIAL));

  const unidadesMap = new Map<string, Unidade>();
  salasDto.forEach((dto) => registrarUnidade(unidadesMap, dto));
  vinculos.forEach((dto) => registrarUnidade(unidadesMap, dto));
  turmasDto.forEach((dto) => registrarUnidade(unidadesMap, dto));

  const salasPorId = new Map(salasDto.map((dto) => [salaId(dto), criarSala(dto)]));

  vinculos.forEach((dto) => {
    let sala = salasPorId.get(salaId(dto));
    if (!sala) {
      sala = criarSala(dto);
      salasPorId.set(sala.id, sala);
    }
    const turno = mapTurno(dto.TURNO);
    if (!turno) return;
    sala.turnos[turno] = {
      nome: dto.TURMA,
      nomeProprio: dto.TURMA,
      alunos: dto.OCUPACAO,
      codTurma: dto.CODTURMA,
      idPerlet: dto.IDPERLET,
      segmento: dto.SEGMENTO,
    };
  });

  // Livres: as turmas de OC_SAL_TURMAS sem vínculo, mais as que vieram sem sala em
  // OC_SAL_TURMASXSALAS (ex.: recém-liberadas), sem repetir.
  const codTurmasComSala = new Set(vinculos.map(chaveTurma));
  const candidatas = new Map<string, ApiTurmaDto>();
  [...turmasDto, ...semSala].forEach((dto) => {
    const chave = chaveTurma(dto);
    if (!codTurmasComSala.has(chave) && !candidatas.has(chave)) candidatas.set(chave, dto);
  });

  const turmasLivres: TurmaLivre[] = Array.from(candidatas.values())
    .map((dto) => {
      const turno = mapTurno(dto.TURNO);
      return turno
        ? {
            codTurma: dto.CODTURMA,
            idPerlet: dto.IDPERLET,
            codFilial: dto.CODFILIAL,
            unidadeId: slugify(nomeUnidade(dto)),
            nome: dto.TURMA,
            turno,
            alunos: dto.OCUPACAO,
            segmento: dto.SEGMENTO,
          }
        : null;
    })
    .filter((t): t is TurmaLivre => t !== null);

  return { unidades: Array.from(unidadesMap.values()), salas: Array.from(salasPorId.values()), turmasLivres };
}
