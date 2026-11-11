import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { OcupacaoApiService } from './ocupacao-api.service';
import { RegrasService } from './regras.service';
import { motivoDaFalha, SalasService, serieDaTurma } from './salas.service';

describe('motivoDaFalha', () => {
  it('usa a mensagem do backend; na validação do ASP.NET, diz os campos em vez do título em inglês', () => {
    expect(motivoDaFalha({ error: { message: 'O RM não criou a sala.' } })).toBe('O RM não criou a sala.');
    const validacao = (errors: Record<string, string[]>) => ({ error: { title: 'One or more validation errors occurred.', errors } });
    expect(motivoDaFalha(validacao({ ANDAR: ['The ANDAR field is required.'] }))).toBe('O servidor recusou o pedido: o campo ANDAR veio inválido.');
    expect(motivoDaFalha(validacao({ ANDAR: ['x'], DESCRICAO: ['y'] }))).toBe(
      'O servidor recusou o pedido: os campos ANDAR, DESCRICAO vieram inválidos.',
    );
    expect(motivoDaFalha({ error: { title: 'Erro qualquer' } })).toBe('Erro qualquer');
    expect(motivoDaFalha(null)).toBe('Não foi possível contatar o servidor.');
  });
});

describe('SalasService.trocandoAno', () => {
  it('cobre a tela só enquanto carrega um ano que ainda não está nela', () => {
    // Cada consulta fica pendente até responder() (as três de uma carga respondem juntas).
    const pendentes: Subject<unknown[]>[] = [];
    const pendente = () => {
      const resposta = new Subject<unknown[]>();
      pendentes.push(resposta);
      return resposta;
    };
    const responder = () =>
      pendentes.splice(0).forEach((resposta) => {
        resposta.next([]);
        resposta.complete();
      });
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OcupacaoApiService,
          useValue: {
            getSalasDoAno: vi.fn(pendente),
            getTurmasXSalas: vi.fn(pendente),
            getTurmas: vi.fn(pendente),
            getAnosLetivos: vi.fn(() => of([{ ANO: '2026' }, { ANO: '2027' }])),
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        { provide: RegrasService, useValue: { regrasDaFilial: () => ({ areaPorAluno: 1.5, pctMaximoUtilizacao: 90, permitirExcesso: false }), carregarFiliais: () => {} } },
      ],
    });
    const salas = TestBed.inject(SalasService);
    salas.selecionarAno('2026');
    TestBed.tick();

    // Primeira carga: ainda não há ano nenhum na tela.
    expect(salas.trocandoAno()).toBe(true);
    responder();
    expect(salas.trocandoAno()).toBe(false);

    salas.selecionarAno('2027');
    expect(salas.trocandoAno()).toBe(true);
    responder();
    expect(salas.trocandoAno()).toBe(false);

    // Recarregar o mesmo ano (depois de gravar) não cobre a tela; só o campo do ano mostra.
    salas.carregar();
    expect(salas.loading()).toBe(true);
    expect(salas.trocandoAno()).toBe(false);
  });
});

describe('SalasService.anosLetivos', () => {
  it('vem dos períodos letivos, com cada ano uma vez só', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OcupacaoApiService,
          useValue: {
            getSalasDoAno: vi.fn(() => of([])),
            getTurmasXSalas: vi.fn(() => of([])),
            getTurmas: vi.fn(() => of([])),
            // Um por período: 2026 tem três (um por filial), 2027 tem um.
            getAnosLetivos: vi.fn(() =>
              of([
                { IDPERLET: 221, ANO: '2026' },
                { IDPERLET: 222, ANO: '2026' },
                { IDPERLET: 223, ANO: '2026' },
                { IDPERLET: 236, ANO: '2027' },
              ]),
            ),
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        { provide: RegrasService, useValue: { regrasDaFilial: () => ({ areaPorAluno: 1.5, pctMaximoUtilizacao: 90, permitirExcesso: false }), carregarFiliais: () => {} } },
      ],
    });
    const salas = TestBed.inject(SalasService);
    TestBed.tick();

    expect(salas.anosLetivos()).toEqual(['2026', '2027']);
    vi.restoreAllMocks();
  });
});

describe('serieDaTurma', () => {
  it('junta as grafias do mesmo ano do Fundamental, com turma e turno', () => {
    expect(['6º ANO A', '6º Ano B', '6º ano C - Manhã', '6º Ano A - Semi-Manhã'].map(serieDaTurma)).toEqual([
      '6º Ano',
      '6º Ano',
      '6º Ano',
      '6º Ano',
    ]);
    expect(serieDaTurma('4º ano K - Semi Trade')).toBe('4º Ano');
  });

  it('junta as grafias do Infantil, com a letra colada ou depois do turno', () => {
    expect(
      ['INFANTIL 2', 'Infantil 2A', 'Infantil 2 - Semi Manhã A', 'Infantil 2 - Integral Manhã', 'Infantil 2 - Tarde D'].map(
        serieDaTurma,
      ),
    ).toEqual(['Infantil 2', 'Infantil 2', 'Infantil 2', 'Infantil 2', 'Infantil 2']);
  });

  it('o Ensino Médio fica como série', () => {
    expect(['1ª SÉRIE A', '1ª Série EM', '1ª série B - Tarde'].map(serieDaTurma)).toEqual([
      '1ª Série',
      '1ª Série',
      '1ª Série',
    ]);
  });

  it('nome fora dos padrões perde só o turno e a letra da turma', () => {
    expect(serieDaTurma('Berçário B - Integral')).toBe('Berçário');
  });
});
