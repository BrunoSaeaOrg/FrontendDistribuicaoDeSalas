import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Sala, TurmaLivre, TurmaVinculada, Turnos, Unidade } from '../../core/models';
import { ApiAlunoEnturmacaoDto, ApiEnturmacaoResultadoDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { SEM_TURMA, VincularAlunosComponent } from './vincular-alunos.component';

const turma = (codTurma: string, nome: string): TurmaVinculada => ({
  nome,
  nomeProprio: nome,
  alunos: 0,
  codTurma,
  idPerlet: 222,
  segmento: 'Anos Iniciais',
});

const sala = (id: string, nome: string, carteiras: number, turnos: Turnos, codFilial = 2): Sala => ({
  id,
  unidadeId: String(codFilial),
  nome,
  tipo: 'Sala de aula',
  andar: '1',
  area: 50,
  carteiras,
  capacidade: carteiras,
  turnos,
  codFilial,
  codBloco: '1',
  codPredio: '1',
  codSala: id,
});

const TERCEIRO = '3º Ano - Ensino Fundamental - Manhã - EF I';
const QUARTO = '4º Ano - Ensino Fundamental - Manhã - EF I';

const aluno = (ra: string, nome: string, codTurma: string | null, extra: Partial<ApiAlunoEnturmacaoDto> = {}): ApiAlunoEnturmacaoDto => ({
  ra,
  nome,
  codFilial: 2,
  segmento: 'Anos Iniciais',
  codCurso: '2',
  codHabilitacao: '3',
  serie: TERCEIRO,
  codTurma,
  turno: 'M',
  novo: false,
  serieAnterior: null,
  turmaAnterior: null,
  dataMatricula: null,
  obs: null,
  ...extra,
});

// Sala 1 (25 carteiras): 3º A e 3º A Semi-Manhã de manhã, dividindo a sala. Sala 3 (4 carteiras):
// 3º B. Sala 5: 4º A, de outra série. O 3º D (tarde) ainda não tem sala nem alunos.
const SALAS = [
  sala('s1', 'SALA 1', 25, { manha: [turma('EF3A-M', '3º Ano A - Manhã'), turma('EF3A-SM', '3º Ano A - Semi-Manhã')] }),
  sala('s3', 'SALA 3', 4, { manha: [turma('EF3B-M', '3º Ano B - Manhã')] }),
  sala('s5', 'SALA 5', 30, { manha: [turma('EF4A-M', '4º Ano A - Manhã')] }),
  // Sala do ano novo ainda sem carteiras cadastradas.
  sala('s6', 'SALA 6', 0, { tarde: [turma('EF4B-T', '4º Ano B - Tarde')] }),
];
const LIVRES: TurmaLivre[] = [
  { codTurma: 'EF3D-T', idPerlet: 222, codFilial: 2, unidadeId: '2', nome: '3º Ano D - Tarde', turno: 'tarde', alunos: 0, segmento: 'Anos Iniciais' },
];
const UNIDADES: Unidade[] = [
  { id: '2', nome: 'CASJ 1', cor: '', codFilial: 2 },
  { id: '13', nome: 'CASJ 2', cor: '', codFilial: 13 },
];

// Os do 3º ano são todos da manhã. Ivo e Júlia estão sem turma: são eles que a origem mostra.
const ALUNOS = [
  aluno('1', 'Ana', 'EF3A-M', { turmaAnterior: 'EF2A-M' }),
  aluno('2', 'Bruno', 'EF3A-M'),
  aluno('3', 'Carla', 'EF3A-SM'),
  aluno('4', 'Davi', 'EF3B-M'),
  aluno('5', 'Eva', 'EF3B-M'),
  aluno('6', 'Fábio', 'EF3B-M'),
  aluno('9', 'Ivo', null, { novo: true }),
  aluno('10', 'Júlia', null, { novo: true }),
  aluno('11', 'Kátia', 'EF4A-M', { codHabilitacao: '4', serie: QUARTO }),
  aluno('12', 'Leo', null, { codHabilitacao: '4', serie: QUARTO }),
];

describe('VincularAlunosComponent (lado a lado)', () => {
  let fixture: ComponentFixture<VincularAlunosComponent>;
  let tela: VincularAlunosComponent;
  let getAlunos: ReturnType<typeof vi.fn>;
  let getFotos: ReturnType<typeof vi.fn>;
  let getPendentes: ReturnType<typeof vi.fn>;
  let salvarNoRm: ReturnType<typeof vi.fn>;
  /** O MD de enturmação do "RM": RA → turma dos movimentos pendentes. */
  let gravadosNoRm: Map<string, string>;
  /** O que o "RM" responde a cada movimento; sem regra, grava como pendente. */
  let respostaDoRm: (m: { ra: string; codTurma: string }) => ApiEnturmacaoResultadoDto;
  const anoLetivo = signal('2026');
  const anoCarregado = signal<string | null>('2026');

  function montar(resposta: () => Observable<ApiAlunoEnturmacaoDto[]> = () => of(ALUNOS)): void {
    anoLetivo.set('2026');
    anoCarregado.set('2026');
    getAlunos = vi.fn(resposta);
    getFotos = vi.fn((_ano: string, _filial: number, ras: string[]) =>
      of(Object.fromEntries(ras.filter((ra) => ra !== '2').map((ra) => [ra, `data:image/jpeg;base64,${ra}`]))),
    );
    gravadosNoRm = new Map();
    respostaDoRm = (m) => ({ ...m, situacao: 'pendente', motivo: null });
    getPendentes = vi.fn(() => of([...gravadosNoRm].map(([ra, codTurma]) => ({ ra, codTurma }))));
    salvarNoRm = vi.fn((_usuario: string, _ano: string, _filial: number, movimentos: { ra: string; codTurma: string }[]) => {
      const resultados = movimentos.map((m) => respostaDoRm(m));
      resultados.filter((r) => r.situacao === 'pendente').forEach((r) => gravadosNoRm.set(r.ra, r.codTurma));
      resultados.filter((r) => r.situacao === 'na-matricula').forEach((r) => gravadosNoRm.delete(r.ra));
      return of(resultados);
    });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OcupacaoApiService,
          useValue: {
            getAlunosEnturmacao: getAlunos,
            getFotosEnturmacao: getFotos,
            getPendentesEnturmacao: getPendentes,
            salvarEnturmacao: salvarNoRm,
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'fulano' }) } },
        { provide: RegrasService, useValue: { regrasDaFilial: () => ({ areaPorAluno: 1.5, pctMaximoUtilizacao: 90, permitirExcesso: false }) } },
        {
          provide: SalasService,
          useValue: {
            anoLetivo,
            anoCarregado,
            anosLetivos: signal(['2026', '2027']),
            salas: signal(SALAS),
            turmasLivres: signal(LIVRES),
            unidades: signal(UNIDADES),
            nomeDaFilial: (cod: number) => (cod === 2 ? 'CASJ 1' : 'CASJ 2'),
            selecionarAno: (ano: string) => anoLetivo.set(ano),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(VincularAlunosComponent);
    fixture.detectChanges();
    tela = fixture.componentInstance;
  }

  function abrir(serie = '2|3'): void {
    tela.selecionarUnidade('2');
    TestBed.tick();
    tela.selecionarSerie(serie);
    TestBed.tick();
  }

  const nomes = (lado: 'origem' | 'destino') => (lado === 'origem' ? tela.origem() : tela.destino())!.alunos.map((a) => a.nome);

  it('a unidade lê os alunos dela e lista as séries com a quantidade', () => {
    montar();
    expect(tela.unidadeOptions().map((o) => o.label)).toEqual(['Selecione a unidade', 'CASJ 1', 'CASJ 2']);
    expect(getAlunos).not.toHaveBeenCalled();

    tela.selecionarUnidade('2');
    TestBed.tick();

    expect(getAlunos).toHaveBeenCalledWith('2026', 2);
    expect(tela.serieOptions().map((o) => o.label)).toEqual(['Selecione a série', '3º Ano - Ensino Fundamental (8)', '4º Ano - Ensino Fundamental (2)']);
  });

  it('a origem é o período (os sem turma dele); o destino abre na primeira turma principal do período', () => {
    montar();
    abrir();

    expect(tela.turmasDaSerie().map((t) => t.id)).toEqual(['EF3A-M', 'EF3A-SM', 'EF3B-M', 'EF3D-T']);
    expect(tela.origemId()).toBe('periodo:M');
    // A Semi-Manhã é subturma: o destino inicial é o 3º A Manhã.
    expect(tela.destinoId()).toBe('EF3A-M');
    expect(nomes('origem')).toEqual(['Ivo', 'Júlia']);
    expect(tela.origem()!.lotacao).toBeNull();
    expect(tela.descricao(tela.origem()!.alunos[0])).toBe('RA 9 · aluno novo');
  });

  it('a origem lista os períodos da série; cada um junta os alunos sem turma dele, pela série do RM', () => {
    const outros = [
      aluno('13', 'Mara', null, { serie: '3º Ano - Ensino Fundamental - Tarde - EF I', turno: 'V' }),
      aluno('14', 'Nina', null, { serie: '3º Ano - Ensino Fundamental - Semi Int.M-EFI', turno: 'M' }),
      aluno('15', 'Otto', 'EF3A-I', { serie: '3º Ano - Ensino Fundamental - Integral - EFI', turno: 'I' }),
      aluno('16', 'Pia', null, { serie: '3º Ano - Ensino Fundamental - Semi Int.T-EFI', turno: 'V' }),
    ];
    montar(() => of([...ALUNOS, ...outros]));
    abrir();

    expect(tela.turmaOptionsOrigem().map((o) => o.label)).toEqual([
      '3º Ano - Manhã',
      '3º Ano - Semi-Manhã',
      '3º Ano - Integral',
      '3º Ano - Tarde',
      '3º Ano - Semi-Tarde',
    ]);
    expect(nomes('origem')).toEqual(['Ivo', 'Júlia']);
    tela.escolherTurma('origem', 'periodo:SM');
    expect(nomes('origem')).toEqual(['Nina']);
    tela.escolherTurma('origem', 'periodo:T');
    expect(nomes('origem')).toEqual(['Mara']);
    tela.escolherTurma('origem', 'periodo:ST');
    expect(nomes('origem')).toEqual(['Pia']);
    // O Otto já tem turma: não fica na origem.
    tela.escolherTurma('origem', 'periodo:I');
    expect(nomes('origem')).toEqual([]);

    // O destino lista as turmas da série com quantos alunos têm, sem "Sem turma".
    expect(tela.turmaOptions().map((o) => o.label)).toEqual([
      '3º Ano A - Manhã (2)',
      '3º Ano A - Semi-Manhã (1)',
      '3º Ano B - Manhã (3)',
      '3º Ano D - Tarde (0)',
      'EF3A-I (1)',
    ]);
  });

  it('a lotação é da sala no turno: as turmas que dividem a sala somam', () => {
    montar();
    abrir();

    const l = tela.destino()!.lotacao!;
    expect([l.alunos, l.carteiras, l.faixa]).toEqual([3, 25, 'disponivel']);
    expect(l.dividemCom).toEqual(['EF3A-SM']);
    // Sobram 22 das 25 carteiras: o selo diz quantas, no tom da faixa.
    expect([l.vagas, l.rotuloVagas, l.tom]).toEqual([22, '22 vagas', 'success']);
  });

  it('as vagas seguem a previsão: sem vaga, e passando das carteiras, quantas faltam', () => {
    montar();
    abrir();
    // Sala 3: 4 carteiras e 3 alunos.
    tela.escolherTurma('destino', 'EF3B-M');
    expect(tela.destino()!.lotacao!.rotuloVagas).toBe('1 vaga');

    tela.alternarAluno('origem', '9');
    expect([tela.destino()!.lotacao!.rotuloVagas, tela.destino()!.lotacao!.tom]).toEqual(['Sem vagas', 'warning']);

    tela.alternarAluno('origem', '10');
    expect([tela.destino()!.lotacao!.rotuloVagas, tela.destino()!.lotacao!.tom]).toEqual(['Falta 1 carteira', 'danger']);

    // O 3º D ainda não tem sala: não há vagas para mostrar.
    tela.escolherTurma('destino', 'EF3D-T');
    expect(tela.destino()!.lotacao).toBeNull();
  });

  it('sala sem carteiras cadastradas não aparece como disponível nem tem selo de vagas', () => {
    montar();
    abrir('2|4');
    tela.escolherTurma('destino', 'EF4B-T');
    const vazia = tela.destino()!.lotacao!;
    expect([vazia.rotulo, vazia.rotuloVagas, vazia.faixa]).toEqual(['Sala sem carteiras cadastradas', '', 'quase']);

    // Com o Leo marcado para vir, a sala sem carteiras passa a excedida.
    tela.alternarAluno('origem', '12');
    expect(tela.destino()!.lotacao!.faixa).toBe('excedida');
  });

  it('marcar de um lado mostra a previsão do outro; mover leva os marcados e entra nos pendentes', () => {
    montar();
    abrir();
    const aviso = vi.spyOn(TestBed.inject(ToastService), 'warning');
    tela.escolherTurma('destino', 'EF3B-M');
    tela.alternarAluno('origem', '9');
    tela.alternarAluno('origem', '10');

    // Sala 3: 3 alunos e 4 carteiras; com os 2 marcados, 5.
    const previsto = tela.destino()!.lotacao!;
    expect([previsto.alunos, previsto.previstos, previsto.faixa]).toEqual([3, 5, 'excedida']);

    tela.moverMarcados('origem');

    expect(nomes('destino')).toEqual(['Ivo', 'Júlia', 'Davi', 'Eva', 'Fábio']);
    expect(nomes('origem')).toEqual([]);
    expect(tela.qtdMarcadosOrigem()).toBe(0);
    expect(tela.pendentes().map((m) => [m.aluno.nome, m.de, m.para])).toEqual([
      ['Ivo', 'Sem turma', '3º Ano B - Manhã'],
      ['Júlia', 'Sem turma', '3º Ano B - Manhã'],
    ]);
    expect(aviso).toHaveBeenCalled();
    expect(tela.veioDe(tela.destino()!.alunos[0])).toBe('sem turma');
  });

  it('voltar para a origem desfaz o movimento; desfazer tira um ou todos', () => {
    montar();
    abrir();
    tela.alternarAluno('origem', '9');
    tela.moverMarcados('origem');
    tela.alternarAluno('destino', '9');
    tela.moverMarcados('destino');
    expect(tela.pendentes()).toEqual([]);
    expect(nomes('origem')).toEqual(['Ivo', 'Júlia']);

    tela.alternarAluno('origem', '9');
    tela.alternarAluno('origem', '10');
    tela.moverMarcados('origem');
    tela.desfazer('9');
    expect(tela.pendentes().map((m) => m.aluno.id)).toEqual(['10']);
    tela.desfazerTudo();
    expect(nomes('origem')).toEqual(['Ivo', 'Júlia']);
  });

  it('levar para a origem um aluno com turma o deixa sem turma, no grupo do período dele', () => {
    montar();
    abrir();
    const sucesso = vi.spyOn(TestBed.inject(ToastService), 'success');
    tela.alternarAluno('destino', '1');
    tela.moverMarcados('destino');

    expect(nomes('origem')).toEqual(['Ana', 'Ivo', 'Júlia']);
    expect(tela.pendentes().map((m) => [m.aluno.id, m.paraId])).toEqual([['1', SEM_TURMA]]);
    expect(sucesso).toHaveBeenCalledWith('1 aluno tirado da turma', expect.any(String));
  });

  it('com marcados dos dois lados, o ⇄ troca: os da origem entram na turma e os da turma voltam para a origem', () => {
    montar();
    abrir();
    const sucesso = vi.spyOn(TestBed.inject(ToastService), 'success');
    tela.alternarAluno('origem', '9');
    expect(tela.podeTrocar()).toBe(false);
    tela.alternarAluno('destino', '1');
    expect(tela.podeTrocar()).toBe(true);

    tela.trocar();

    // O Ivo entra no 3º A e a Ana fica sem turma; os lados continuam os mesmos.
    expect([tela.origemId(), tela.destinoId()]).toEqual(['periodo:M', 'EF3A-M']);
    expect(nomes('origem')).toEqual(['Ana', 'Júlia']);
    expect(nomes('destino')).toEqual(['Ivo', 'Bruno']);
    expect(tela.pendentes().map((m) => [m.aluno.id, m.paraId])).toEqual([
      ['9', 'EF3A-M'],
      ['1', SEM_TURMA],
    ]);
    expect([tela.qtdMarcadosOrigem(), tela.qtdMarcadosDestino()]).toEqual([0, 0]);
    expect(tela.podeSalvar()).toBe(true);
    expect(sucesso).toHaveBeenCalledWith('2 alunos trocados entre 3º Ano - Manhã e 3º Ano A - Manhã', expect.any(String));

    // Sem marcados dos dois lados, o ⇄ não faz nada.
    tela.trocar();
    expect([tela.origemId(), tela.destinoId()]).toEqual(['periodo:M', 'EF3A-M']);
    expect(tela.pendentes()).toHaveLength(2);
  });

  it('na origem, o checkbox marca o aluno e a linha abre os dados dele, um por vez', () => {
    montar();
    abrir();
    tela.definirMarcado('origem', '9', true);
    tela.definirMarcado('origem', '9', true);
    expect(tela.marcado('origem', '9')).toBe(true);
    tela.definirMarcado('origem', '9', false);
    expect(tela.marcado('origem', '9')).toBe(false);

    tela.alternarDetalhe('9');
    expect(tela.detalheAberto()).toBe('9');
    tela.alternarDetalhe('10');
    expect(tela.detalheAberto()).toBe('10');
    tela.alternarDetalhe('10');
    expect(tela.detalheAberto()).toBeNull();

    // O cartão já mostra série, período, aluno e matrícula; o detalhe fica com o resto.
    const ivo = tela.origem()!.alunos.find((a) => a.id === '9')!;
    expect(tela.detalhes(ivo)).toEqual([]);
    const ana = tela.destino()!.alunos.find((a) => a.id === '1')!;
    expect(tela.detalhes(ana)).toEqual([{ rotulo: 'Ano anterior', valor: 'EF2A-M' }]);
  });

  it('o cartão da origem mostra série, período, aluno e matrícula, sem a turma; a observação só se houver', () => {
    const extra = { dataMatricula: '2025-11-24T00:00:00-03:00', obs: 'Alergia a amendoim.', instituicaoOrigem: 'Escola Pé Pequeno' };
    montar(() => of(ALUNOS.map((a) => (a.ra === '9' ? { ...a, ...extra } : a))));
    abrir();
    const [ivo, julia] = tela.origem()!.alunos;
    expect(tela.resumo(ivo)).toEqual([
      { rotulo: 'Série', valor: '3º Ano - Ensino Fundamental' },
      { rotulo: 'Período', valor: 'Manhã' },
      { rotulo: 'Aluno', valor: 'Novo' },
      { rotulo: 'Matrícula', valor: '24/11/2025' },
    ]);
    // Sem data da matrícula no RM, o campo fica com traço.
    expect(tela.resumo(julia).find((d) => d.rotulo === 'Matrícula')?.valor).toBe('—');

    fixture.detectChanges();
    const cartaoDe = (ra: string) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('.va-linha')].find((c) =>
        c.querySelector('.va-linha-sub')?.textContent?.includes(`RA ${ra}`),
      )!;
    const dadosDe = (ra: string) =>
      [...cartaoDe(ra).querySelectorAll('.va-linha-dados > div')].map((d) => `${d.querySelector('dt')?.textContent?.trim()}: ${d.querySelector('dd')?.textContent?.trim()}`);
    expect(dadosDe('9')).toEqual([
      'Série: 3º Ano - Ensino Fundamental',
      'Período: Manhã',
      'Aluno: Novo',
      'Matrícula: 24/11/2025',
      'Observação: Alergia a amendoim.',
    ]);
    expect(dadosDe('10')).toEqual(['Série: 3º Ano - Ensino Fundamental', 'Período: Manhã', 'Aluno: Novo', 'Matrícula: —']);
    expect(cartaoDe('9').textContent).not.toContain('Turma');
    // O RA continua embaixo do nome, como era; "aluno novo" não se repete, já está no campo Aluno.
    expect(cartaoDe('9').querySelector('.va-linha-sub')?.textContent?.trim()).toBe('RA 9');

    // O detalhe fica com o que o cartão não mostra: a escola de origem e o movimento ainda não salvo.
    expect(tela.detalhes(ivo)).toEqual([{ rotulo: 'Escola de origem', valor: 'Escola Pé Pequeno' }]);
    tela.definirMarcado('origem', '9', true);
    tela.moverMarcados('origem');
    expect(tela.detalhes(ivo)).toContainEqual({ rotulo: 'Nesta tela', valor: 'movido de Sem turma para 3º Ano A - Manhã, falta salvar' });
  });

  it('na origem, sem nada a mais para mostrar, clicar no cartão marca o aluno', () => {
    montar();
    abrir();
    fixture.detectChanges();
    const botaoDe = (ra: string) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.va-linha-abrir')].find((b) =>
        b.textContent?.includes(`RA ${ra}`),
      )!;
    expect(botaoDe('9').getAttribute('aria-expanded')).toBeNull();
    botaoDe('9').click();
    expect(tela.marcado('origem', '9')).toBe(true);
    expect(tela.detalheAberto()).toBeNull();
  });

  it('pede as fotos dos dois lados uma vez só; sem foto, o cartão mostra as iniciais', () => {
    montar();
    abrir();
    expect(getFotos).toHaveBeenCalledTimes(1);
    expect([...getFotos.mock.calls[0][2]].sort()).toEqual(['1', '10', '2', '9']);

    const [ana, bruno] = tela.destino()!.alunos;
    expect(tela.foto(ana)).toBe('data:image/jpeg;base64,1');
    expect(tela.foto(bruno)).toBeNull();
    expect(tela.iniciais('Bruno Gomes Silva')).toBe('BS');
  });

  it('os movimentos ficam guardados por unidade', () => {
    montar();
    abrir();
    tela.alternarAluno('origem', '9');
    tela.moverMarcados('origem');

    tela.selecionarUnidade('13');
    TestBed.tick();
    expect(tela.pendentes()).toEqual([]);

    abrir();
    expect(tela.pendentes().map((m) => m.aluno.id)).toEqual(['9']);
  });

  it('enquanto lê não há painéis; com erro, tentar de novo relê', () => {
    const resposta = new Subject<ApiAlunoEnturmacaoDto[]>();
    montar(() => resposta);
    tela.selecionarUnidade('2');
    TestBed.tick();
    expect(tela.estadoAlunos()?.estado).toBe('carregando');
    expect(tela.origem()).toBeNull();
    expect(tela.estimativaLeitura()).toBeGreaterThan(0);

    resposta.error(new Error('RM fora do ar'));
    expect(tela.estadoAlunos()?.estado).toBe('erro');

    getAlunos.mockImplementation(() => of(ALUNOS));
    tela.tentarDeNovo();
    expect(tela.estadoAlunos()?.estado).toBe('pronto');
  });

  it('arrastar leva o aluno para o outro lado; arrastando um marcado, vão todos os marcados do lado', () => {
    montar();
    abrir();
    const evento = () =>
      ({
        preventDefault: vi.fn(),
        dataTransfer: { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' },
      }) as unknown as DragEvent;

    tela.iniciarArrasto('origem', '9', evento());
    expect(tela.arrasto()).toEqual({ de: 'origem', ras: ['9'] });
    expect(tela.arrastando('9')).toBe(true);
    const sobre = evento();
    tela.arrastarSobre('destino', sobre);
    expect(sobre.preventDefault).toHaveBeenCalled();
    expect(tela.alvoDoArrasto()).toBe('destino');
    tela.soltar('destino', evento());
    expect(nomes('destino')).toEqual(['Ivo', 'Ana', 'Bruno']);
    expect([tela.arrasto(), tela.alvoDoArrasto()]).toEqual([null, null]);

    tela.alternarAluno('destino', '1');
    tela.alternarAluno('destino', '2');
    const inicio = evento();
    tela.iniciarArrasto('destino', '1', inicio);
    expect(tela.arrasto()!.ras).toEqual(['1', '2']);
    // Vários: a imagem do arraste é a etiqueta com quantos são.
    expect(inicio.dataTransfer!.setDragImage).toHaveBeenCalled();
    tela.soltar('origem', evento());
    expect(nomes('origem')).toEqual(['Ana', 'Bruno', 'Júlia']);

    // No próprio lado não se solta.
    tela.iniciarArrasto('origem', '10', evento());
    const mesmoLado = evento();
    tela.arrastarSobre('origem', mesmoLado);
    expect(mesmoLado.preventDefault).not.toHaveBeenCalled();
    tela.soltar('origem', evento());
    expect(tela.pendentes().map((m) => m.aluno.id)).toEqual(['9', '1', '2']);
  });

  it('o cartão mostra o primeiro e o segundo nome (a partícula vai junto)', () => {
    montar();
    expect(tela.doisNomes('ADAM FERREIRA CHEDID')).toBe('ADAM FERREIRA');
    expect(tela.doisNomes('MARIA DA SILVA SANTOS')).toBe('MARIA DA SILVA');
    expect(tela.doisNomes(' Ana ')).toBe('Ana');
  });

  it('o movimento já gravado no RM põe o aluno na turma nova, com a etiqueta "gravado"', () => {
    montar();
    gravadosNoRm.set('1', 'EF3B-M');
    abrir();

    expect(getPendentes).toHaveBeenCalledWith('fulano', '2026', 2);
    expect(nomes('destino')).toEqual(['Bruno']);
    tela.escolherTurma('destino', 'EF3B-M');
    const ana = tela.destino()!.alunos.find((a) => a.id === '1')!;
    expect(tela.gravado(ana)).toContain('EF3A-M');
    expect(tela.destino()!.lotacao!.alunos).toBe(4);

    // Levar de volta para a origem é um movimento (o RM diz 3º B): ela fica sem turma.
    tela.alternarAluno('destino', '1');
    tela.moverMarcados('destino');
    expect(tela.pendentes().map((m) => [m.aluno.id, m.paraId])).toEqual([['1', SEM_TURMA]]);
    expect(tela.gravado(tela.origem()!.alunos.find((a) => a.id === '1')!)).toBeNull();
  });

  it('salvar grava os movimentos; os gravados saem da lista e os que falharam ficam com o motivo', () => {
    montar();
    abrir();
    respostaDoRm = (m) =>
      m.ra === '10' ? { ...m, situacao: 'falhou', motivo: 'Não foi possível salvar: tempo esgotado.' } : { ...m, situacao: 'pendente', motivo: null };
    const aviso = vi.spyOn(TestBed.inject(ToastService), 'warning');
    tela.alternarAluno('origem', '9');
    tela.alternarAluno('origem', '10');
    tela.moverMarcados('origem');
    // A Ana volta para a origem: tirar da turma não grava.
    tela.alternarAluno('destino', '1');
    tela.moverMarcados('destino');
    expect(tela.podeSalvar()).toBe(true);

    tela.salvar();

    // "Sem turma" não vai para o RM.
    expect(salvarNoRm).toHaveBeenCalledWith('fulano', '2026', 2, [
      { ra: '9', codTurma: 'EF3A-M' },
      { ra: '10', codTurma: 'EF3A-M' },
    ]);
    expect(tela.salvando()).toBe(0);
    expect(tela.pendentes().map((m) => [m.aluno.id, m.falha])).toEqual([
      ['10', 'Não foi possível salvar: tempo esgotado.'],
      ['1', 'Não dá para salvar o aluno sem turma: escolha a turma dele.'],
    ]);
    expect(aviso).toHaveBeenCalledWith('1 movimento salvo; 2 não', expect.stringContaining('tempo esgotado'));
    // Sem a lista de movimentos, o motivo fica no próprio aluno.
    const julia = tela.destino()!.alunos.find((a) => a.id === '10')!;
    expect(tela.falhaDe(julia)).toBe('Não foi possível salvar: tempo esgotado.');
    expect(tela.detalhes(julia)).toContainEqual({ rotulo: 'Não salvou', valor: 'Não foi possível salvar: tempo esgotado.' });
    // O Ivo continua no 3º A, agora como gravado; os pendentes foram relidos do RM.
    const ivo = tela.destino()!.alunos.find((a) => a.id === '9')!;
    expect(ivo.gravadoNoRm).toBe(true);
    expect(getPendentes).toHaveBeenCalledTimes(2);

    // Desfazer o que falhou esquece o motivo.
    tela.desfazer('10');
    expect(tela.pendentes().map((m) => m.aluno.id)).toEqual(['1']);
  });

  it('erro do back na gravação avisa e mantém os movimentos', () => {
    montar();
    abrir();
    salvarNoRm.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Só no TTESTE.' } })));
    const erro = vi.spyOn(TestBed.inject(ToastService), 'danger');
    tela.alternarAluno('origem', '9');
    tela.moverMarcados('origem');

    tela.salvar();

    expect(erro).toHaveBeenCalledWith('Não foi possível salvar', 'Só no TTESTE.');
    expect(tela.pendentes().map((m) => m.aluno.id)).toEqual(['9']);
    expect(tela.podeSalvar()).toBe(true);
  });

  it('recriada pelo layout (celular ↔ computador), a tela volta como estava, com os movimentos por salvar', () => {
    montar();
    abrir();
    tela.escolherTurma('destino', 'EF3D-T');
    tela.alternarAluno('origem', '9');
    tela.moverMarcados('origem');
    TestBed.tick();
    fixture.destroy();

    fixture = TestBed.createComponent(VincularAlunosComponent);
    fixture.detectChanges();
    tela = fixture.componentInstance;

    expect([tela.codFilial(), tela.serie(), tela.origemId(), tela.destinoId()]).toEqual([2, '2|3', 'periodo:M', 'EF3D-T']);
    expect(tela.pendentes().map((m) => [m.aluno.id, m.paraId])).toEqual([['9', 'EF3D-T']]);
    expect(nomes('destino')).toEqual(['Ivo']);
    // A leitura dos alunos ainda vale: a tela recriada não vai ao RM de novo.
    expect(getAlunos).toHaveBeenCalledTimes(1);
  });

  it('aberta em outro ano, a tela não retoma a escolha do ano anterior', () => {
    montar();
    abrir();
    TestBed.tick();
    fixture.destroy();

    anoLetivo.set('2027');
    anoCarregado.set('2027');
    fixture = TestBed.createComponent(VincularAlunosComponent);
    fixture.detectChanges();
    tela = fixture.componentInstance;

    expect([tela.codFilial(), tela.serie(), tela.origemId(), tela.destinoId()]).toEqual([null, '', null, null]);
  });
});
