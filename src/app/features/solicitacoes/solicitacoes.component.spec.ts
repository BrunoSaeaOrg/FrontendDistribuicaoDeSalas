import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiSalaDoAnoDto, ApiSolicitacaoDto, ApiStatusSolicitacao } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { RegrasService } from '../../core/services/regras.service';
import { SolicitacoesComponent } from './solicitacoes.component';

const sala = (codFilial: number, filial: string, codSala: string): ApiSalaDoAnoDto => ({
  CODFILIAL: codFilial,
  FILIAL: filial,
  CODBLOCO: '1',
  CODPREDIO: '1',
  CODTIPOSALA: 1,
  TIPOSALA: 'Sala de aula',
  CODSALA: codSala,
  SALA: `Sala ${codSala}`,
  ANDAR: '1',
  CARTEIRAS: 30,
  CAPACIDADE: 30,
  CAPACIDADEMAXIMA: 30,
  AREA: 45,
  IDPERLET: 222,
  ANO: '2026',
});

const pedido = (codSolicitacao: number, codFilial: number, codSala: string, status: ApiStatusSolicitacao): ApiSolicitacaoDto => ({
  codSolicitacao,
  codFilial,
  codBloco: '1',
  codPredio: '1',
  codSala,
  quantidade: 2,
  justificativa: `Pedido ${codSolicitacao}`,
  status,
  codUsuarioSolicitante: 'bruno',
  dataSolicitacao: '2026-11-03T10:00:00',
  codUsuarioDecisao: null,
  dataDecisao: null,
});

// Cada filial é uma unidade: a CASJ (filiais 2, 13 e 16; a 16 sem pedidos) vira CASJ 1, 2 e 3; a Sul (filial 6) fica Sul.
const SALAS = [sala(2, 'CASJ', '17'), sala(13, 'CASJ', '5'), sala(16, 'CASJ', '40'), sala(6, 'Sul', '1')];
const PEDIDOS = [pedido(1, 2, '17', 'P'), pedido(2, 2, '17', 'A'), pedido(3, 13, '5', 'P'), pedido(4, 6, '1', 'R')];

describe('SolicitacoesComponent: fila por unidade', () => {
  let fixture: ComponentFixture<SolicitacoesComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [SolicitacoesComponent],
      providers: [
        {
          provide: OcupacaoApiService,
          useValue: {
            getSalasDoAno: () => of(SALAS),
            getTurmasXSalas: () => of([]),
            getTurmas: () => of([]),
            getAnosLetivos: () => of([]),
            // Como o TOTVS às vezes faz: ignora o CODFILIAL e devolve a lista inteira.
            getSolicitacoes: () => of(PEDIDOS),
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        { provide: RegrasService, useValue: { regrasDaFilial: () => ({ areaPorAluno: 1.5, pctMaximoUtilizacao: 90, permitirExcesso: false }), carregarFiliais: () => {} } },
      ],
    });
    fixture = TestBed.createComponent(SolicitacoesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const tela = () => fixture.componentInstance;
  const fila = () => tela().solicitacoesRows().map((r) => `${r.solicitacao.salaNome} (${r.unidadeNome}) ${r.statusLabel}`);
  const el = () => fixture.nativeElement as HTMLElement;

  it('mostra todas as solicitações, da mais nova para a mais antiga, com o status só no badge', () => {
    expect(fila()).toEqual([
      'Sala 1 (Sul) Recusada',
      'Sala 5 (CASJ 2) Pendente',
      'Sala 17 (CASJ 1) Aprovada',
      'Sala 17 (CASJ 1) Pendente',
    ]);
    expect(el().querySelectorAll('.sol-tabela tbody tr')).toHaveLength(4);
    // Sem abas nem botões de status: o status é o badge, e só o pendente pisca.
    expect(el().querySelector('[role="tablist"]')).toBeNull();
    expect(el().querySelectorAll('.sol-badge-pulse')).toHaveLength(2);
  });

  it('cada filial é uma unidade no campo Unidade, sem a palavra "filial", e não há mais campo Filial', () => {
    expect(tela().unidadeOptions().map((o) => o.label)).toEqual(['CASJ 1', 'CASJ 2', 'CASJ 3', 'Sul']);
    expect(el().querySelector('app-select[label="Filial"]')).toBeNull();
    expect(el().textContent).not.toContain('filial');
  });

  it('as unidades marcadas mudam a fila; nenhuma marcada mostra todas', () => {
    tela().selecionarUnidades(['13']);
    expect(fila()).toEqual(['Sala 5 (CASJ 2) Pendente']);

    tela().selecionarUnidades(['2']);
    expect(fila()).toEqual(['Sala 17 (CASJ 1) Aprovada', 'Sala 17 (CASJ 1) Pendente']);

    tela().selecionarUnidades(['2', '6']);
    expect(fila()).toEqual(['Sala 1 (Sul) Recusada', 'Sala 17 (CASJ 1) Aprovada', 'Sala 17 (CASJ 1) Pendente']);

    tela().selecionarUnidades([]);
    expect(fila()).toHaveLength(4);
  });

  it('unidade sem solicitação: a fila vazia diz qual é', () => {
    tela().selecionarUnidades(['16']);
    fixture.detectChanges();
    expect(fila()).toEqual([]);
    expect(tela().filaVazia()).toBe('Nenhuma solicitação da CASJ 3');
    expect(el().textContent).toContain('Nenhuma solicitação da CASJ 3');
  });

  it('no formulário, as salas de várias unidades levam o nome da unidade; numa unidade só, não', () => {
    expect(tela().salaOptions().map((o) => o.label)).toEqual([
      'Sala 17 · CASJ 1',
      'Sala 5 · CASJ 2',
      'Sala 40 · CASJ 3',
      'Sala 1 · Sul',
    ]);
    tela().selecionarUnidades(['13']);
    expect(tela().salaOptions().map((o) => o.label)).toEqual(['Sala 5']);
    expect(tela().salaSelecionadaId()).toBe(tela().salasDaUnidade()[0].id);
  });
});
