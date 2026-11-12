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

/**
 * O nome da unidade como vem do RM. OC_SAL_SALAS expoe o nome em FILIAL, enquanto
 * OC_SAL_TURMASXSALAS e OC_SAL_TURMAS usam UNIDADE; aceita os dois. '' = sem nome.
 */
export function nomeDoRm(dto: { UNIDADE?: string; FILIAL?: string }): string {
  return dto.UNIDADE?.trim() || dto.FILIAL?.trim() || '';
}

/**
 * Cada filial é uma unidade. O id é o CODFILIAL, que as três consultas trazem igual (o nome pode
 * vir escrito diferente em FILIAL e em UNIDADE).
 */
function unidadeId(dto: { CODFILIAL: number }): string {
  return String(dto.CODFILIAL);
}

/** Em ordem de nome, com o número em ordem de número ("CASJ 2" antes de "CASJ 10"). */
export const COMPARADOR_UNIDADE = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/**
 * O nome de cada filial na tela, sem a palavra "filial": quando o RM dá o mesmo nome a mais de uma
 * (a CASJ tem as filiais 2, 13 e 16), elas viram "CASJ 1", "CASJ 2" e "CASJ 3", na ordem do
 * CODFILIAL; nome único fica como está ("Liceu"). Sem nome no RM, "Unidade N" (N = CODFILIAL).
 *
 * Recebe CODFILIAL → nome do RM de todas as filiais conhecidas, não só as do ano em tela: assim a
 * filial 13 continua "CASJ 2" num ano em que só ela e a 16 têm salas.
 */
export function nomesDasUnidades(filiais: ReadonlyMap<number, string>): Map<number, string> {
  // "CASJ" e "Casj" são o mesmo nome.
  const porNome = new Map<string, { codFilial: number; nome: string }[]>();
  filiais.forEach((nome, codFilial) => {
    const limpo = nome.trim();
    if (!limpo) return;
    const chave = semAcentos(limpo).toLocaleLowerCase('pt-BR');
    porNome.set(chave, [...(porNome.get(chave) ?? []), { codFilial, nome: limpo }]);
  });
  const nomes = new Map<number, string>();
  porNome.forEach((grupo) => {
    const ordem = [...grupo].sort((a, b) => a.codFilial - b.codFilial);
    // A grafia é a da menor filial, para não depender da ordem em que as respostas chegam.
    const nome = ordem[0].nome;
    ordem.forEach(({ codFilial }, i) => nomes.set(codFilial, ordem.length > 1 ? `${nome} ${i + 1}` : nome));
  });
  filiais.forEach((_, codFilial) => {
    if (!nomes.has(codFilial)) nomes.set(codFilial, `Unidade ${codFilial}`);
  });
  return nomes;
}

/**
 * CODFILIAL → nome do RM de cada filial que aparece nas respostas. Vale o nome da primeira lista
 * que o traz: as salas vêm antes das turmas, como antes (a unidade era nomeada pela sala).
 */
export function filiaisDasRespostas(
  ...listas: ReadonlyArray<{ CODFILIAL: number; UNIDADE?: string; FILIAL?: string }>[]
): Map<number, string> {
  const filiais = new Map<number, string>();
  listas.flat().forEach((dto) => {
    if (!filiais.get(dto.CODFILIAL)) filiais.set(dto.CODFILIAL, nomeDoRm(dto));
  });
  return filiais;
}

/** Junta as filiais já conhecidas com as novas; nome vazio não apaga um que já se conhecia. */
export function juntarFiliais(
  conhecidas: ReadonlyMap<number, string>,
  novas: ReadonlyMap<number, string>,
): Map<number, string> {
  const juntas = new Map(conhecidas);
  novas.forEach((nome, codFilial) => {
    if (nome || !juntas.has(codFilial)) juntas.set(codFilial, nome);
  });
  return juntas;
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
export function lerComposicao(composicao: string | undefined): { codTurma: string; alunos: number }[] {
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

/** As unidades (uma por filial com sala) em ordem de nome ("CASJ 1", "CASJ 2"...), cada uma com a sua cor. */
function unidadesDasSalas(salasDto: ApiSalaDto[], nomes: ReadonlyMap<number, string>): Unidade[] {
  return [...new Set(salasDto.map((dto) => dto.CODFILIAL))]
    .map((codFilial) => ({ codFilial, nome: nomes.get(codFilial) ?? `Unidade ${codFilial}` }))
    .sort((a, b) => COMPARADOR_UNIDADE.compare(a.nome, b.nome) || a.codFilial - b.codFilial)
    .map(({ codFilial, nome }, i) => ({
      id: String(codFilial),
      nome,
      cor: CORES_UNIDADE[i % CORES_UNIDADE.length],
      codFilial,
    }));
}

function criarSala(dto: ApiSalaDto): Sala {
  return {
    id: salaId(dto),
    unidadeId: unidadeId(dto),
    nome: dto.SALA,
    tipo: dto.TIPOSALA,
    andar: (dto.ANDAR ?? '').trim(),
    area: dto.AREA,
    carteiras: dto.CARTEIRAS,
    capacidade: dto.CAPACIDADE,
    turnos: {},
    codFilial: dto.CODFILIAL,
    codBloco: dto.CODBLOCO,
    codPredio: dto.CODPREDIO,
    codSala: dto.CODSALA,
    motivoIndisponivel: dto.MOTIVO?.trim() || null,
  };
}

/**
 * OC_SAL_TURMASXSALAS devolve também as turmas SEM sala (CODSALA vazio): a turma recém-liberada
 * volta assim, e as de outras filiais também. Elas não são vínculo — tratá-las como vínculo
 * criava "salas" sem nome na tela (só com "Liberar") e escondia a turma da lista para vincular.
 */
export function temSala(dto: ApiTurmaXSalaDto): boolean {
  return String(dto.CODSALA ?? '').trim() !== '';
}

function chaveTurma(dto: { CODTURMA: string; IDPERLET: number; TURNO?: string }): string {
  return `${dto.CODTURMA}|${dto.IDPERLET}|${dto.TURNO}`;
}

/**
 * `filiaisConhecidas` (CODFILIAL → nome do RM) são as filiais de outras cargas (outros anos), para
 * a numeração "CASJ 1", "CASJ 2" não mudar de um ano para outro; as das respostas entram junto.
 */
export function fundirSalasEApi(
  salasDto: ApiSalaDto[],
  turmasXSalasDto: ApiTurmaXSalaDto[],
  turmasDto: ApiTurmaDto[] = [],
  filiaisConhecidas: ReadonlyMap<number, string> = new Map(),
): { unidades: Unidade[]; salas: Sala[]; turmasLivres: TurmaLivre[] } {
  // As salas do ano são as de API.OC.SAL.PERIO, só das filiais com período letivo aberto. Sala,
  // unidade e turma livre de fora delas não aparecem: um ano ainda sem período (ex.: o próximo)
  // fica sem sala nenhuma, mesmo que o RM já traga turmas e vínculos dele.
  const vinculos = turmasXSalasDto.filter(temSala);
  // Turma sem sala só interessa nas filiais em que o usuário tem salas (onde ele pode vinculá-la).
  const filiaisDoUsuario = new Set(salasDto.map((dto) => dto.CODFILIAL));
  const semSala = turmasXSalasDto.filter((dto) => !temSala(dto) && filiaisDoUsuario.has(dto.CODFILIAL));
  const turmasDasFiliais = turmasDto.filter((dto) => filiaisDoUsuario.has(dto.CODFILIAL));

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

  let vinculosForaDoPeriodo = 0;
  vinculos.forEach((dto) => {
    // Sala que não está em API.OC.SAL.PERIO não vira sala na tela. As subturmas dela seguem
    // marcadas como vinculadas, para não aparecerem como livres.
    const sala = salasPorId.get(salaId(dto));
    if (!sala) vinculosForaDoPeriodo++;
    const mae = turmaPorCodigo.get(chaveSubturma(dto.CODTURMA, dto.IDPERLET));
    const partes = lerComposicao(dto.COMPOSICAO);
    // Sem COMPOSICAO, a linha é a própria turma.
    (partes.length > 0 ? partes : [{ codTurma: dto.CODTURMA, alunos: dto.OCUPACAO }]).forEach((parte) => {
      const chave = chaveSubturma(parte.codTurma, dto.IDPERLET);
      subturmasComSala.add(chave);
      if (!sala) return;
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
  if (vinculosForaDoPeriodo > 0) {
    console.warn(
      `[ocupacao-adapter] ${vinculosForaDoPeriodo} vínculo(s) ignorado(s): a sala não está no período letivo do ano (API.OC.SAL.PERIO)`,
    );
  }

  // Várias turmas no mesmo turno: em ordem de nome, para a tela não trocar a ordem a cada carga.
  salasPorId.forEach((sala) =>
    Object.values(sala.turnos).forEach((turmas) =>
      turmas?.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })),
    ),
  );

  // Livres: as turmas de OC_SAL_TURMAS sem vínculo, mais as que vieram sem sala em
  // OC_SAL_TURMASXSALAS (ex.: recém-liberadas), sem repetir, só das filiais com sala no ano.
  // Subturma que está em alguma sala (em qualquer parte de uma COMPOSICAO) não é livre.
  const candidatas = new Map<string, ApiTurmaDto | ApiTurmaXSalaDto>();
  [...turmasDasFiliais, ...semSala].forEach((dto) => {
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
            unidadeId: unidadeId(dto),
            nome: dto.TURMA ?? dto.CODTURMA,
            turno,
            alunos: dto.OCUPACAO,
            segmento: dto.SEGMENTO ?? '',
          }
        : null;
    })
    .filter((t): t is TurmaLivre => t !== null);

  const filiais = juntarFiliais(filiaisConhecidas, filiaisDasRespostas(salasDto, turmasXSalasDto, turmasDto));
  return {
    unidades: unidadesDasSalas(salasDto, nomesDasUnidades(filiais)),
    salas: Array.from(salasPorId.values()),
    turmasLivres,
  };
}
