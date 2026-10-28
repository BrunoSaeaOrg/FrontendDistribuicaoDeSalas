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

/** Manhã ou tarde; qualquer outro (ex.: Integral) ou vazio dá null. */
function turnoDoDia(turno: string | undefined): Turno | null {
  const normalizado = semAcentos(turno).toLowerCase().trim();
  return normalizado === 'manha' || normalizado === 'tarde' ? normalizado : null;
}

/** "EF4F-I (3) + EF4F-SM (0)" → EF4F-I com 3 alunos e EF4F-SM com 0. */
function lerComposicao(composicao: string | undefined): { codTurma: string; alunos: number }[] {
  return (composicao ?? '')
    .split('+')
    .map((parte) => /^\s*(.+?)\s*\((\d+)\)\s*$/.exec(parte))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ codTurma: m[1], alunos: Number(m[2]) }));
}

/** O mesmo código de turma se repete em outras filiais, cada uma com o seu IDPERLET. */
function chaveSubturma(codTurma: string, idPerlet: number): string {
  return `${codTurma}|${idPerlet}`;
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

function chaveTurma(dto: { CODTURMA: string; IDPERLET: number; TURNO?: string }): string {
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

  // OC_SAL_TURMAS traz cada subturma (ex.: EF3A-SM, "3º Ano A - Semi-Manhã") como uma turma, e é
  // ela que se vincula. Já OC_SAL_TURMASXSALAS agrupa por turma-mãe e sala e põe as subturmas em
  // COMPOSICAO; sem a subturma principal, a linha vem sem TURMA e TURNO. Por isso o vínculo é lido
  // subturma a subturma, com o nome e o turno de cada uma vindos de OC_SAL_TURMAS.
  const turmaPorCodigo = new Map(turmasDto.map((dto) => [chaveSubturma(dto.CODTURMA, dto.IDPERLET), dto]));
  const subturmasComSala = new Set<string>();

  /**
   * A integral (TURNO "Integral") não tem turno de aula próprio: fica no da turma-mãe, achada pelo
   * código (EF3B-I → EF3B-M de manhã, ou EF3B-T de tarde). Assim ela entra e sai da sala como
   * qualquer turma.
   */
  const turnoDaMae = (codTurma: string, idPerlet: number): Turno | null => {
    const prefixo = codTurma.replace(/-[^-]+$/, '');
    for (const sufixo of ['M', 'T']) {
      const turno = turnoDoDia(turmaPorCodigo.get(chaveSubturma(`${prefixo}-${sufixo}`, idPerlet))?.TURNO);
      if (turno) return turno;
    }
    return null;
  };

  vinculos.forEach((dto) => {
    let sala = salasPorId.get(salaId(dto));
    if (!sala) {
      sala = criarSala(dto);
      salasPorId.set(sala.id, sala);
    }
    const mae = turmaPorCodigo.get(chaveSubturma(dto.CODTURMA, dto.IDPERLET));
    const partes = lerComposicao(dto.COMPOSICAO);
    // Sem COMPOSICAO, a linha é a própria turma.
    (partes.length > 0 ? partes : [{ codTurma: dto.CODTURMA, alunos: dto.OCUPACAO }]).forEach((parte) => {
      const chave = chaveSubturma(parte.codTurma, dto.IDPERLET);
      subturmasComSala.add(chave);
      const daLinha = parte.codTurma === dto.CODTURMA;
      const info = turmaPorCodigo.get(chave);
      // A integral fica no turno da turma-mãe da linha, como o RM já faz ao somar os alunos.
      const turno =
        turnoDoDia(info?.TURNO ?? (daLinha ? dto.TURNO : undefined)) ??
        turnoDoDia(dto.TURNO ?? mae?.TURNO) ??
        turnoDaMae(parte.codTurma, dto.IDPERLET);
      if (!turno) {
        console.warn(`[ocupacao-adapter] Subturma sem turno ignorada: ${parte.codTurma} (${dto.COMPOSICAO})`);
        return;
      }
      const turmas = (sala.turnos[turno] ??= []);
      // A mesma subturma repetida na resposta contaria os alunos duas vezes.
      if (turmas.some((t) => t.codTurma === parte.codTurma && t.idPerlet === dto.IDPERLET)) return;
      const nome = info?.TURMA ?? (daLinha ? dto.TURMA : undefined) ?? parte.codTurma;
      turmas.push({
        nome,
        nomeProprio: nome,
        alunos: parte.alunos,
        codTurma: parte.codTurma,
        idPerlet: dto.IDPERLET,
        segmento: info?.SEGMENTO ?? dto.SEGMENTO ?? mae?.SEGMENTO ?? '',
      });
    });
  });

  // Várias turmas no mesmo turno: em ordem de nome, para a tela não trocar a ordem a cada carga.
  salasPorId.forEach((sala) =>
    Object.values(sala.turnos).forEach((turmas) =>
      turmas?.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })),
    ),
  );

  // Livres: as turmas de OC_SAL_TURMAS sem vínculo, mais as que vieram sem sala em
  // OC_SAL_TURMASXSALAS (ex.: recém-liberadas), sem repetir. Subturma que está em alguma sala
  // (em qualquer parte de uma COMPOSICAO) não é livre.
  const candidatas = new Map<string, ApiTurmaDto | ApiTurmaXSalaDto>();
  [...turmasDto, ...semSala].forEach((dto) => {
    const chave = chaveTurma(dto);
    if (!subturmasComSala.has(chaveSubturma(dto.CODTURMA, dto.IDPERLET)) && !candidatas.has(chave)) {
      candidatas.set(chave, dto);
    }
  });

  const turmasLivres: TurmaLivre[] = Array.from(candidatas.values())
    .map((dto) => {
      // Só quem tem turno próprio (Integral) vai para o da turma-mãe. Linha sem TURNO de
      // OC_SAL_TURMASXSALAS é um pedaço de COMPOSICAO, não uma turma: fica de fora.
      const turno = turnoDoDia(dto.TURNO) ?? (dto.TURNO ? turnoDaMae(dto.CODTURMA, dto.IDPERLET) : null);
      if (!turno) console.warn(`[ocupacao-adapter] Turma sem turno ignorada: ${dto.CODTURMA} ("${dto.TURNO ?? ''}")`);
      return turno
        ? {
            codTurma: dto.CODTURMA,
            idPerlet: dto.IDPERLET,
            codFilial: dto.CODFILIAL,
            unidadeId: slugify(nomeUnidade(dto)),
            nome: dto.TURMA ?? dto.CODTURMA,
            turno,
            alunos: dto.OCUPACAO,
            segmento: dto.SEGMENTO ?? '',
          }
        : null;
    })
    .filter((t): t is TurmaLivre => t !== null);

  return { unidades: Array.from(unidadesMap.values()), salas: Array.from(salasPorId.values()), turmasLivres };
}
