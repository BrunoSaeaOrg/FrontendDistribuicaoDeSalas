import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Sala, TurmaLivre, TurmaVinculada, Turnos, Unidade } from '../../core/models';
import { ApiAlunoEnturmacaoDto, ApiEnturmacaoResultadoDto, ApiTurmaEnturmacaoDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { VincularAlunosComponent } from './vincular-alunos.component';

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
/** O cadastro das turmas da unidade (API.OC.ENTUR.TUR), como o RM manda hoje: sem curso, habilitação nem turno. */
const turmaDoCadastro = (codTurma: string, nome: string, extra: Partial<ApiTurmaEnturmacaoDto> = {}): ApiTurmaEnturmacaoDto => ({
  codTurma,
  nome,
  idPerlet: 222,
  segmento: 'Anos Iniciais',
  ...extra,
});
const TURMAS = [
  turmaDoCadastro('EF3A-M', '3º Ano A - Manhã'),
  turmaDoCadastro('EF3A-SM', '3º Ano A - Semi-Manhã'),
  turmaDoCadastro('EF3B-M', '3º Ano B - Manhã'),
  turmaDoCadastro('EF3D-T', '3º Ano D - Tarde'),
  turmaDoCadastro('EF4A-M', '4º Ano A - Manhã'),
  turmaDoCadastro('EF4B-T', '4º Ano B - Tarde'),
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
  let getTurmas: ReturnType<typeof vi.fn>;
  let getFotos: ReturnType<typeof vi.fn>;
  let getPendentes: ReturnType<typeof vi.fn>;
  let salvarNoRm: ReturnType<typeof vi.fn>;
  /** O MD de enturmação do "RM": RA → turma dos movimentos pendentes. */
  let gravadosNoRm: Map<string, string>;
  /**
   * O que o "RM" responde a cada movimento. Sem regra, grava como pendente; a turma vazia desfaz o
   * movimento ainda não importado, e o aluno volta para a turma da matrícula.
   */
  let respostaDoRm: (m: { ra: string; codTurma: string }) => ApiEnturmacaoResultadoDto;
  const anoLetivo = signal('2026');
  const anoCarregado = signal<string | null>('2026');

  function montar(
    resposta: () => Observable<ApiAlunoEnturmacaoDto[]> = () => of(ALUNOS),
    turmas: () => Observable<ApiTurmaEnturmacaoDto[]> = () => of(TURMAS),
  ): void {
    anoLetivo.set('2026');
    anoCarregado.set('2026');
    getAlunos = vi.fn(resposta);
    getTurmas = vi.fn(turmas);
    getFotos = vi.fn((_ano: string, _filial: number, ras: string[]) =>
      of(Object.fromEntries(ras.filter((ra) => ra !== '2').map((ra) => [ra, `data:image/jpeg;base64,${ra}`]))),
    );
    gravadosNoRm = new Map();
    respostaDoRm = (m) => ({ ...m, situacao: m.codTurma === '' ? 'na-matricula' : 'pendente', motivo: null });
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
            getTurmasEnturmacao: getTurmas,
            getFotosEnturmacao: getFotos,
            getPendentesEnturmacao: getPendentes,
            salvarEnturmacao: salvarNoRm,
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'fulano' }) } },
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
    expect(tela.descricao(tela.origem()!.alunos[0])).toBe('RA 9 · aluno novo');
  });

  it('o destino são as turmas do cadastro da unidade, com ou sem sala, também as que o Painel não mostra', () => {
    // O cadastro tem a Integral do 3º A (sem sala e fora das salas do ano) e não tem o 3º D.
    const cadastro = [...TURMAS.filter((t) => t.codTurma !== 'EF3D-T'), turmaDoCadastro('EF3A-I', '3º Ano A - Integral')];
    montar(undefined, () => of(cadastro));
    abrir();

    expect(getTurmas).toHaveBeenCalledWith('2026', 2);
    expect(tela.turmasDaSerie().map((t) => t.id)).toEqual(['EF3A-I', 'EF3A-M', 'EF3A-SM', 'EF3B-M']);
    // A Integral não é a turma principal: o destino abre no 3º A Manhã.
    expect(tela.destinoId()).toBe('EF3A-M');
    // Sem sala, o turno sai do fim do código e não há com quem dividir a sala.
    const integral = tela.turmasDaSerie().find((t) => t.id === 'EF3A-I')!;
    expect([integral.sala, integral.turno]).toEqual([null, 'Integral']);
    tela.escolherTurma('destino', 'EF3A-I');
    expect(tela.destino()!.dividemCom).toEqual([]);
  });

  it('com curso e habilitação no cadastro, a série da turma é por eles, não pelo nome', () => {
    const cadastro = [
      turmaDoCadastro('EF3A-M', '3º Ano A - Manhã', { codCurso: '2', codHabilitacao: '03' }),
      turmaDoCadastro('ESP-M', 'Turma especial - Manhã', { codCurso: '02', codHabilitacao: '3' }),
      // O nome diz 3º Ano, mas a habilitação é a do 4º.
      turmaDoCadastro('EF3Z-M', '3º Ano Z - Manhã', { codCurso: '2', codHabilitacao: '4' }),
    ];
    montar(undefined, () => of(cadastro));
    abrir();

    // O 3º A Semi-Manhã e o 3º B não estão nesse cadastro, mas têm alunos da série: entram assim mesmo.
    expect(tela.turmasDaSerie().map((t) => t.id)).toEqual(['EF3A-M', 'EF3A-SM', 'EF3B-M', 'ESP-M']);
  });

  it('sem as turmas da unidade, a série não abre e a tela diz o que falhou; "Tentar de novo" relê só as turmas', () => {
    let falhar = true;
    montar(undefined, () => (falhar ? throwError(() => new Error('RM fora do ar')) : of(TURMAS)));
    tela.selecionarUnidade('2');
    TestBed.tick();

    expect(tela.erroDeLeitura()).toBe('Não foi possível ler as turmas da unidade no RM.');
    expect(tela.prontos()).toBe(false);
    expect(tela.serieOptions().map((o) => o.label)).toEqual(['Carregando...']);

    falhar = false;
    tela.tentarDeNovo();
    TestBed.tick();

    expect(tela.erroDeLeitura()).toBeNull();
    expect(tela.prontos()).toBe(true);
    expect([getAlunos.mock.calls.length, getTurmas.mock.calls.length]).toEqual([1, 2]);
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

  it('o painel mostra a sala da turma e quem divide a sala no turno, sem a lotação de carteiras', () => {
    montar();
    abrir();
    expect(tela.destino()!.dividemCom).toEqual(['EF3A-SM']);
    expect(tela.origem()!.dividemCom).toEqual([]);

    fixture.detectChanges();
    const destino = (fixture.nativeElement as HTMLElement).querySelectorAll('.va-painel')[1];
    const sala = destino.querySelector('.va-painel-sub')!.textContent!.replace(/\s+/g, ' ');
    expect(sala).toContain('SALA 1');
    expect(sala).toContain('divide a sala com EF3A-SM');
    expect(destino.textContent).not.toContain('carteiras');
    // Sem desfazer nem salvar: mover já grava.
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Desfazer tudo');
  });

  it('mover grava na hora: os marcados entram na turma e ficam como gravados no RM', () => {
    montar();
    abrir();
    const sucesso = vi.spyOn(TestBed.inject(ToastService), 'success');
    tela.alternarAluno('origem', '9');
    tela.alternarAluno('origem', '10');
    tela.moverMarcados('origem');

    expect(salvarNoRm).toHaveBeenCalledWith('fulano', '2026', 2, [
      { ra: '9', codTurma: 'EF3A-M' },
      { ra: '10', codTurma: 'EF3A-M' },
    ]);
    // Os recém-movidos vêm primeiro, destacados.
    expect(nomes('destino')).toEqual(['Ivo', 'Júlia', 'Ana', 'Bruno']);
    expect(nomes('origem')).toEqual([]);
    expect([tela.qtdMarcadosOrigem(), tela.salvando()]).toEqual([0, 0]);
    expect(tela.destino()!.alunos.filter((a) => a.gravadoNoRm).map((a) => a.id)).toEqual(['9', '10']);
    expect(sucesso).toHaveBeenCalledWith('2 alunos movidos para 3º Ano A - Manhã');
  });

  it('passando das carteiras da sala, o aviso diz quantos alunos para quantas; sala sem carteiras cadastradas não avisa', () => {
    montar();
    abrir();
    const aviso = vi.spyOn(TestBed.inject(ToastService), 'warning');
    const sucesso = vi.spyOn(TestBed.inject(ToastService), 'success');
    // Sala 3: 4 carteiras e 3 alunos; com o Ivo e a Júlia, 5.
    tela.escolherTurma('destino', 'EF3B-M');
    tela.alternarAluno('origem', '9');
    tela.alternarAluno('origem', '10');
    tela.moverMarcados('origem');
    expect(aviso).toHaveBeenCalledWith('2 alunos movidos para 3º Ano B - Manhã', 'A sala passou das carteiras: 5 alunos para 4.');

    // A Sala 6 ainda não tem carteiras cadastradas: não há o que comparar.
    tela.selecionarSerie('2|4');
    tela.escolherTurma('destino', 'EF4B-T');
    tela.alternarAluno('origem', '12');
    tela.moverMarcados('origem');
    expect(sucesso).toHaveBeenCalledWith('1 aluno movido para 4º Ano B - Tarde');
  });

  it('no destino, os marcados vão para outra turma da série pelo "Mover para outra turma", e já grava', () => {
    montar();
    abrir();
    const sucesso = vi.spyOn(TestBed.inject(ToastService), 'success');
    // O Ivo e a Júlia foram para o 3º A por engano: o certo é o 3º D.
    tela.alternarAluno('origem', '9');
    tela.alternarAluno('origem', '10');
    tela.moverMarcados('origem');

    // A lista são as outras turmas da série, com quantos alunos têm agora.
    expect(tela.turmasParaMover().map((t) => [t.id, t.qtd])).toEqual([
      ['EF3A-SM', 1],
      ['EF3B-M', 3],
      ['EF3D-T', 0],
    ]);
    const botao = document.createElement('button');
    const clique = { currentTarget: botao } as unknown as Event;
    // Sem marcados no destino, a lista não abre.
    tela.alternarMenuMover(clique);
    expect(tela.menuMoverAberto()).toBeNull();

    tela.alternarAluno('destino', '9');
    tela.alternarAluno('destino', '10');
    tela.alternarMenuMover(clique);
    expect(tela.menuMoverAberto()).toBe(botao);
    // Esc e o clique fora fecham; o clique no próprio botão fica para ele.
    tela.teclaNoMenu(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tela.menuMoverAberto()).toBeNull();
    tela.alternarMenuMover(clique);
    tela.cliqueForaDoMenu({ target: botao } as unknown as MouseEvent);
    expect(tela.menuMoverAberto()).toBe(botao);
    tela.cliqueForaDoMenu({ target: document.body } as unknown as MouseEvent);
    expect(tela.menuMoverAberto()).toBeNull();

    tela.alternarMenuMover(clique);
    tela.moverMarcadosPara('EF3D-T');

    expect(salvarNoRm).toHaveBeenLastCalledWith('fulano', '2026', 2, [
      { ra: '9', codTurma: 'EF3D-T' },
      { ra: '10', codTurma: 'EF3D-T' },
    ]);
    expect(sucesso).toHaveBeenLastCalledWith('2 alunos movidos para 3º Ano D - Tarde');
    expect([tela.menuMoverAberto(), tela.qtdMarcadosDestino()]).toEqual([null, 0]);
    expect(nomes('destino')).toEqual(['Ana', 'Bruno']);
    tela.escolherTurma('destino', 'EF3D-T');
    expect(nomes('destino')).toEqual(['Ivo', 'Júlia']);
  });

  it('enquanto grava, nada mais se move; o aluno já aparece na turma nova', () => {
    montar();
    abrir();
    const resposta = new Subject<ApiEnturmacaoResultadoDto[]>();
    salvarNoRm.mockImplementation(() => resposta);
    tela.alternarAluno('origem', '9');
    tela.moverMarcados('origem');

    expect(nomes('destino')).toEqual(['Ivo', 'Ana', 'Bruno']);
    expect([tela.salvando(), tela.podeMover()]).toEqual([1, false]);
    expect(tela.espera().texto).toBe('Salvando 1 movimento...');
    tela.alternarAluno('origem', '10');
    tela.moverMarcados('origem');
    const arraste = { preventDefault: vi.fn(), dataTransfer: null } as unknown as DragEvent;
    tela.iniciarArrasto('origem', '10', arraste);
    expect(arraste.preventDefault).toHaveBeenCalled();
    expect(salvarNoRm).toHaveBeenCalledTimes(1);

    gravadosNoRm.set('9', 'EF3A-M');
    resposta.next([{ ra: '9', codTurma: 'EF3A-M', situacao: 'pendente', motivo: null }]);
    resposta.complete();
    expect(tela.podeMover()).toBe(true);
    expect(nomes('destino')).toEqual(['Ivo', 'Ana', 'Bruno']);
  });

  it('sem os movimentos já gravados, a tela não deixa mover', () => {
    montar();
    getPendentes.mockImplementation(() => throwError(() => new Error('RM fora do ar')));
    abrir();

    expect(tela.estadoPendentes()?.estado).toBe('erro');
    expect(tela.podeMover()).toBe(false);
    tela.alternarAluno('origem', '9');
    tela.moverMarcados('origem');
    expect(salvarNoRm).not.toHaveBeenCalled();
    expect(nomes('origem')).toEqual(['Ivo', 'Júlia']);
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
      { rotulo: 'Série', valor: '3º Ano', complemento: 'Ensino Fundamental' },
      { rotulo: 'Período', valor: 'Manhã', icone: 'wb_sunny' },
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
    expect(dadosDe('9')).toEqual(['Série: 3º Ano · Ensino Fundamental', 'Período: Manhã', 'Matrícula: 24/11/2025']);
    expect(dadosDe('10')).toEqual(['Série: 3º Ano · Ensino Fundamental', 'Período: Manhã', 'Matrícula: —']);
    // A observação fica embaixo da faixa, só no cartão de quem tem.
    expect(cartaoDe('9').querySelector('.va-linha-obs-texto')?.textContent?.trim()).toBe('Alergia a amendoim.');
    expect(cartaoDe('10').querySelector('.va-linha-obs')).toBeNull();
    // Novo ou veterano vai no selo ao lado do nome.
    expect(cartaoDe('9').querySelector('.va-selo')?.textContent?.trim()).toBe('Novo');
    expect(cartaoDe('9').textContent).not.toContain('Turma');
    // O RA fica embaixo da foto, sozinho, como num crachá.
    expect(cartaoDe('9').querySelector('.va-linha-sub')?.textContent?.trim()).toBe('RA 9');

    // O detalhe fica com o que o cartão não mostra: a escola de origem e a turma gravada no RM.
    expect(tela.detalhes(ivo)).toEqual([{ rotulo: 'Escola de origem', valor: 'Escola Pé Pequeno' }]);
    tela.definirMarcado('origem', '9', true);
    tela.moverMarcados('origem');
    const gravado = tela.destino()!.alunos.find((a) => a.id === '9')!;
    expect(tela.detalhes(gravado)).toContainEqual({ rotulo: 'Salvo para', valor: '3º Ano A - Manhã' });
  });

  it('na origem, sem nada a mais para mostrar, clicar no cartão marca o aluno', () => {
    montar();
    abrir();
    fixture.detectChanges();
    const botaoDe = (ra: string) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('.va-linha')]
        .find((c) => c.querySelector('.va-linha-sub')?.textContent?.trim() === `RA ${ra}`)!
        .querySelector<HTMLButtonElement>('.va-linha-abrir')!;
    expect(botaoDe('9').getAttribute('aria-expanded')).toBeNull();
    botaoDe('9').click();
    expect(tela.marcado('origem', '9')).toBe(true);
    expect(tela.detalheAberto()).toBeNull();
  });

  it('a foto ampliada abre e fecha no clique, com Esc e sozinha quando o aluno muda de lado', () => {
    montar();
    abrir();
    const ivo = tela.origem()!.alunos.find((a) => a.id === '9')!;
    const clique = { stopPropagation: () => undefined, currentTarget: document.createElement('button') } as unknown as Event;

    tela.alternarPrevia('origem', ivo, clique);
    expect(tela.alunoDaPrevia()?.id).toBe('9');
    expect(tela.previaAberta('origem', '9')).toBe(true);
    tela.alternarPrevia('origem', ivo, clique);
    expect(tela.previa()).toBeNull();

    tela.alternarPrevia('origem', ivo, clique);
    tela.teclaNaPrevia(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tela.previa()).toBeNull();

    // Movido para o destino, o aluno sai da origem: a foto aberta lá fecha.
    tela.alternarPrevia('origem', ivo, clique);
    tela.definirMarcado('origem', '9', true);
    tela.moverMarcados('origem');
    expect(tela.alunoDaPrevia()).toBeNull();
  });

  it('a busca acha pelo nome, sem acento, ou pelo RA; "Marcar" com busca marca só os encontrados; a lista fica de A a Z e o botão inverte', () => {
    montar();
    abrir();
    const visiveis = (lado: 'origem' | 'destino') => (lado === 'origem' ? tela.origem() : tela.destino())!.visiveis.map((a) => a.id);

    tela.buscar('origem', 'julia');
    expect(visiveis('origem')).toEqual(['10']);
    tela.buscar('origem', '9');
    expect(visiveis('origem')).toEqual(['9']);
    tela.buscar('origem', 'ninguem');
    expect(visiveis('origem')).toEqual([]);
    expect(tela.origem()!.alunos.length).toBe(2);

    // Com busca, marcar todos marca só os encontrados; sem ela, a lista toda volta e nem todos estão marcados.
    tela.buscar('origem', 'ivo');
    tela.alternarTodos('origem');
    expect(tela.marcado('origem', '9')).toBe(true);
    expect(tela.marcado('origem', '10')).toBe(false);
    expect(tela.todosMarcados('origem')).toBe(true);
    expect(tela.estadoMarcarTodos('origem')).toBe('true');
    tela.buscar('origem', '');
    expect(tela.todosMarcados('origem')).toBe(false);
    expect(tela.estadoMarcarTodos('origem')).toBe('mixed');

    // A lista fica sempre de A a Z: a Júlia, recém-movida, entra no lugar dela no alfabeto. O botão inverte.
    tela.definirMarcado('origem', '9', false);
    tela.definirMarcado('origem', '10', true);
    tela.moverMarcados('origem');
    expect(tela.ordemDe('destino')).toBe('az');
    expect(visiveis('destino')).toEqual(['1', '2', '10']);
    tela.alternarOrdem('destino');
    expect(tela.ordemDe('destino')).toBe('za');
    expect(visiveis('destino')).toEqual(['10', '2', '1']);
    tela.alternarOrdem('destino');
    expect(visiveis('destino')).toEqual(['1', '2', '10']);
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

  it('o que foi gravado continua lá ao voltar para a unidade', () => {
    montar();
    abrir();
    tela.alternarAluno('origem', '9');
    tela.moverMarcados('origem');

    tela.selecionarUnidade('13');
    TestBed.tick();
    abrir();
    expect(nomes('destino')).toEqual(['Ana', 'Bruno', 'Ivo']);
    expect(nomes('origem')).toEqual(['Júlia']);
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

    // Arrastando um marcado, vão todos os marcados do lado; a imagem do arraste é a etiqueta com quantos são.
    tela.alternarAluno('origem', '9');
    tela.alternarAluno('origem', '10');
    const inicio = evento();
    tela.iniciarArrasto('origem', '9', inicio);
    expect(tela.arrasto()).toEqual({ de: 'origem', ras: ['9', '10'] });
    expect(tela.arrastando('10')).toBe(true);
    expect(inicio.dataTransfer!.setDragImage).toHaveBeenCalled();
    const sobre = evento();
    tela.arrastarSobre('destino', sobre);
    expect(sobre.preventDefault).toHaveBeenCalled();
    expect(tela.alvoDoArrasto()).toBe('destino');
    tela.soltar('destino', evento());
    expect(nomes('destino')).toEqual(['Ivo', 'Júlia', 'Ana', 'Bruno']);
    expect([tela.arrasto(), tela.alvoDoArrasto()]).toEqual([null, null]);

    // Sem marcar, vai só o arrastado.
    tela.iniciarArrasto('destino', '10', evento());
    expect(tela.arrasto()!.ras).toEqual(['10']);
    tela.soltar('origem', evento());
    expect(nomes('origem')).toEqual(['Júlia']);

    // No próprio lado não se solta.
    tela.iniciarArrasto('origem', '10', evento());
    const mesmoLado = evento();
    tela.arrastarSobre('origem', mesmoLado);
    expect(mesmoLado.preventDefault).not.toHaveBeenCalled();
    tela.soltar('origem', evento());
    expect(salvarNoRm).toHaveBeenCalledTimes(2);
  });

  it('o cartão mostra o primeiro e o segundo nome (a partícula vai junto)', () => {
    montar();
    expect(tela.doisNomes('ADAM FERREIRA CHEDID')).toBe('ADAM FERREIRA');
    expect(tela.doisNomes('MARIA DA SILVA SANTOS')).toBe('MARIA DA SILVA');
    expect(tela.doisNomes(' Ana ')).toBe('Ana');
  });

  it('o movimento já gravado no RM põe o aluno na turma nova', () => {
    montar();
    gravadosNoRm.set('1', 'EF3B-M');
    abrir();

    expect(getPendentes).toHaveBeenCalledWith('fulano', '2026', 2);
    expect(nomes('destino')).toEqual(['Bruno']);
    tela.escolherTurma('destino', 'EF3B-M');
    expect(tela.destino()!.alunos.map((a) => a.id)).toContain('1');

    // Levar de volta para a origem desfaz o movimento no RM: ela volta para a turma da matrícula, o 3º A.
    tela.alternarAluno('destino', '1');
    tela.moverMarcados('destino');
    expect(salvarNoRm).toHaveBeenCalledWith('fulano', '2026', 2, [{ ra: '1', codTurma: '' }]);
    tela.escolherTurma('destino', 'EF3A-M');
    expect(nomes('destino')).toEqual(['Ana', 'Bruno']);
  });

  it('tirar da turma o aluno com movimento salvo e sem turma na matrícula desfaz o movimento no RM', () => {
    montar();
    gravadosNoRm.set('9', 'EF3A-M');
    abrir();
    const sucesso = vi.spyOn(TestBed.inject(ToastService), 'success');
    expect(tela.destino()!.alunos.map((a) => a.id)).toContain('9');

    tela.alternarAluno('destino', '9');
    tela.moverMarcados('destino');

    expect(salvarNoRm).toHaveBeenCalledWith('fulano', '2026', 2, [{ ra: '9', codTurma: '' }]);
    // De volta à origem, no grupo do período dele.
    expect(nomes('origem')).toEqual(['Ivo', 'Júlia']);
    expect(tela.origem()!.alunos.find((a) => a.id === '9')!.gravadoNoRm).toBe(false);
    expect(sucesso).toHaveBeenCalledWith('1 aluno tirado da turma');
  });

  it('o que o RM não grava volta para onde estava, com o motivo no aluno', () => {
    montar();
    abrir();
    const jaNaMatricula = 'O aluno já está na turma EF3A-M na matrícula: para tirá-lo da turma, faça no RM.';
    respostaDoRm = (m) =>
      m.ra === '10'
        ? { ...m, situacao: 'falhou', motivo: 'Não foi possível salvar: tempo esgotado.' }
        : m.codTurma === ''
          ? { ...m, situacao: 'falhou', motivo: jaNaMatricula }
          : { ...m, situacao: 'pendente', motivo: null };
    const aviso = vi.spyOn(TestBed.inject(ToastService), 'warning');
    tela.alternarAluno('origem', '9');
    tela.alternarAluno('origem', '10');
    tela.moverMarcados('origem');

    expect(salvarNoRm).toHaveBeenCalledWith('fulano', '2026', 2, [
      { ra: '9', codTurma: 'EF3A-M' },
      { ra: '10', codTurma: 'EF3A-M' },
    ]);
    expect(tela.salvando()).toBe(0);
    expect(aviso).toHaveBeenCalledWith('1 aluno movido para 3º Ano A - Manhã; 1 não', 'Não foi possível salvar: tempo esgotado.');
    // O Ivo ficou no 3º A, gravado; a Júlia voltou para a origem, com o motivo nela.
    expect(nomes('destino')).toEqual(['Ivo', 'Ana', 'Bruno']);
    expect(nomes('origem')).toEqual(['Júlia']);
    const julia = tela.origem()!.alunos[0];
    expect(tela.falhaDe(julia)).toBe('Não foi possível salvar: tempo esgotado.');
    expect(tela.detalhes(julia)).toContainEqual({ rotulo: 'Não salvou', valor: 'Não foi possível salvar: tempo esgotado.' });
    expect(tela.destino()!.alunos.find((a) => a.id === '9')!.gravadoNoRm).toBe(true);
    // Depois da gravação, os pendentes foram relidos do RM.
    expect(getPendentes).toHaveBeenCalledTimes(2);

    // A Ana já está no 3º A na matrícula: o RM recusa tirá-la, e ela fica. O motivo é o da última gravação.
    tela.alternarAluno('destino', '1');
    tela.moverMarcados('destino');
    expect(aviso).toHaveBeenLastCalledWith('Nenhum aluno foi movido', jaNaMatricula);
    expect(nomes('destino')).toContain('Ana');
    expect(tela.falhaDe(tela.destino()!.alunos.find((a) => a.id === '1')!)).toBe(jaNaMatricula);
    expect(tela.falhaDe(julia)).toBeNull();
  });

  it('erro do back na gravação avisa e devolve os alunos para onde estavam', () => {
    montar();
    abrir();
    salvarNoRm.mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 400, error: { message: 'Só no TTESTE.' } })));
    const erro = vi.spyOn(TestBed.inject(ToastService), 'danger');
    tela.alternarAluno('origem', '9');
    tela.moverMarcados('origem');

    expect(erro).toHaveBeenCalledWith('Não foi possível salvar', 'Só no TTESTE. O aluno voltou para onde estava.');
    expect(nomes('origem')).toEqual(['Ivo', 'Júlia']);
    expect(tela.falhaDe(tela.origem()!.alunos[0])).toBe('Só no TTESTE.');
    expect([tela.salvando(), tela.podeMover()]).toEqual([0, true]);
  });

  it('recriada pelo layout (celular ↔ computador), a tela volta como estava', () => {
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
