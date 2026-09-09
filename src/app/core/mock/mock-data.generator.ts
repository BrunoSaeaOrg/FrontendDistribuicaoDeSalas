import { Sala, Solicitacao, Turno, Unidade } from '../models';

/** PRNG determinístico (mulberry32) — garante que os dados mockados sejam estáveis entre reloads. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildUnidades(): Unidade[] {
  const def: [string, string, string | null, string?][] = [
    ['casj', 'CASJ', '--saea-unit-casj'],
    ['liceu', 'Liceu', '--saea-unit-liceu'],
    ['cansf', 'CANSF', '--saea-unit-cansf'],
    ['mendel', 'Mendel', '--saea-unit-mendel'],
    ['sta-rita-sp', 'Sta. Rita/SP', '--saea-unit-sta-rita-sp'],
    ['sta-rita-go', 'Sta. Rita/GO', null, '#ffff00'],
    ['sto-antonio', 'Sto. Antônio', '--saea-unit-sto-antonio'],
    ['sta-monica', 'Sta. Mônica', '--saea-unit-sta-monica'],
    ['sta-helena', 'Sta. Helena', null, '#b5e6a2'],
    ['d-fernando', 'D. Fernando', '--saea-unit-d-fernando'],
    ['m-leonia', 'M. Leônia', null, '#f2ceef'],
  ];
  return def.map(([id, nome, corVar, corLiteral]) => ({
    id,
    nome,
    cor: corLiteral || `var(${corVar})`,
  }));
}

export function gerarSalas(unidades: Unidade[]): Sala[] {
  const rng = mulberry32(20260826);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)];
  const tipos: { tipo: string; areaMin: number; areaMax: number; count: [number, number] }[] = [
    { tipo: 'Sala de aula', areaMin: 42, areaMax: 58, count: [5, 7] },
    { tipo: 'Laboratório de Informática', areaMin: 46, areaMax: 58, count: [1, 1] },
    { tipo: 'Laboratório de Ciências', areaMin: 50, areaMax: 62, count: [0, 1] },
    { tipo: 'Sala Multiuso', areaMin: 36, areaMax: 48, count: [1, 2] },
    { tipo: 'Biblioteca', areaMin: 60, areaMax: 80, count: [0, 1] },
  ];
  const nomesDia = [
    '1º Ano A', '1º Ano B', '2º Ano A', '2º Ano B', '3º Ano A', '4º Ano A', '4º Ano B',
    '5º Ano A', '6º Ano A', '6º Ano B', '7º Ano A', '7º Ano B', '8º Ano A', '9º Ano A',
    '9º Ano B', '1ª Série EM', '1ª Série EM B', '2ª Série EM', '3ª Série EM', 'Infantil II', 'Infantil III',
  ];
  const nomesProprios = [
    'Turma Girassol', 'Turma Ipê', 'Turma Jacarandá', 'Turma Alecrim', 'Turma Cedro', 'Turma Orquídea',
    'Turma Sabiá', 'Turma Bem-te-vi', 'Turma Estrela', 'Turma Aurora', 'Turma Semente', 'Turma Raiz',
    'Turma Alegria', 'Turma Harmonia', 'Turma Coral', 'Turma Nascente',
  ];
  const salas: Sala[] = [];

  unidades.forEach((u) => {
    let contador = 0;
    tipos.forEach((def) => {
      const qty = def.count[0] + Math.floor(rng() * (def.count[1] - def.count[0] + 1));
      for (let i = 0; i < qty; i++) {
        contador++;
        const area = Math.round(def.areaMin + rng() * (def.areaMax - def.areaMin));
        const capLegal = Math.max(1, Math.floor(area / 1.5));
        const overloadSala = rng() < 0.12;
        const carteiras = overloadSala
          ? capLegal + 1 + Math.floor(rng() * 3)
          : Math.max(8, Math.min(capLegal, Math.round(capLegal * (0.7 + rng() * 0.3))));
        const nome =
          def.tipo === 'Sala de aula'
            ? `Sala ${String(contador).padStart(2, '0')}`
            : def.count[1] > 1
              ? `${def.tipo} ${i + 1}`
              : def.tipo;
        const turnos: Sala['turnos'] = {};
        (['manha', 'tarde'] as Turno[]).forEach((turno) => {
          if (rng() < 0.88) {
            const nomeT = pick(nomesDia);
            const alunos = Math.max(6, Math.min(carteiras, Math.round(carteiras * (0.72 + rng() * 0.25))));
            turnos[turno] = { nome: nomeT, nomeProprio: pick(nomesProprios), alunos };
          } else {
            turnos[turno] = null;
          }
        });
        salas.push({
          id: `${u.id}-s${contador}-${def.tipo.slice(0, 3)}`,
          unidadeId: u.id,
          nome,
          tipo: def.tipo,
          area,
          carteiras,
          turnos,
        });
      }
    });
  });

  // Garante ao menos uma sala "Excedida" por unidade (a primeira unidade recebe mais, para demonstrar o estado no painel).
  unidades.forEach((u, idx) => {
    const salasDaUnidade = salas.filter((s) => s.unidadeId === u.id && s.tipo === 'Sala de aula');
    const alvo = idx === 0 ? salasDaUnidade : salasDaUnidade.slice(0, 1);
    alvo.forEach((s) => {
      const capLegal = Math.max(1, Math.floor(s.area / 1.5));
      s.carteiras = capLegal + 2 + Math.floor(rng() * 3);
      (['manha', 'tarde'] as Turno[]).forEach((turno) => {
        const turma = s.turnos[turno];
        if (turma) turma.alunos = s.carteiras;
      });
    });
  });

  return salas;
}

export function gerarSolicitacoes(salas: Sala[]): Solicitacao[] {
  const amostras = salas.filter((_, i) => i % 9 === 0).slice(0, 6);
  const status: Solicitacao['status'][] = ['pendente', 'aprovada', 'recusada', 'pendente'];
  const datas = ['12/08/2026', '15/08/2026', '18/08/2026', '20/08/2026', '21/08/2026', '24/08/2026'];
  return amostras.map((s, i) => ({
    id: 'sol-seed-' + i,
    salaId: s.id,
    salaNome: s.nome,
    unidadeId: s.unidadeId,
    quantidade: 2 + (i % 4),
    justificativa:
      i % 2 === 0 ? 'Turma cresceu após matrícula tardia.' : 'Redistribuição para nova turma no turno.',
    status: status[i % status.length],
    data: datas[i % datas.length],
  }));
}
