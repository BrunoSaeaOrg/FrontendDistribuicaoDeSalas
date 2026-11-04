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

// CASJ com as filiais 2, 13 e 16 (uma unidade só, pelo nome; a 16 sem pedidos) e a Sul com a 6.
const SALAS = [sala(2, 'CASJ', '17'), sala(13, 'CASJ', '5'), sala(16, 'CASJ', '40'), sala(6, 'Sul', '1')];
const PEDIDOS = [pedido(1, 2, '17', 'P'), pedido(2, 2, '17', 'A'), pedido(3, 13, '5', 'P'), pedido(4, 6, '1', 'R')];

describe('SolicitacoesComponent: fila por filial', () => {
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
        { provide: RegrasService, useValue: { regras: signal({ pctMaximoUtilizacao: 90, permitirExcesso: false }) } },
      ],
    });
    fixture = TestBed.createComponent(SolicitacoesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const tela = () => fixture.componentInstance;
  const fila = () => tela().solicitacoesRows().map((r) => `${r.solicitacao.salaNome} (${r.filialNome}) ${r.statusLabel}`);
  const el = () => fixture.nativeElement as HTMLElement;

  it('mostra todas as solicitações, da mais nova para a mais antiga, com o status só no badge', () => {
    expect(fila()).toEqual([
      'Sala 1 (Sul · filial 6) Recusada',
      'Sala 5 (CASJ · filial 13) Pendente',
      'Sala 17 (CASJ · filial 2) Aprovada',
      'Sala 17 (CASJ · filial 2) Pendente',
    ]);
    expect(el().querySelectorAll('.sol-tabela tbody tr')).toHaveLength(4);
    // Sem abas nem botões de status: o status é o badge, e só o pendente pisca.
    expect(el().querySelector('[role="tablist"]')).toBeNull();
    expect(el().querySelectorAll('.sol-badge-pulse')).toHaveLength(2);
  });

  it('a filial escolhida muda a fila', () => {
    tela().onFilialChange('13');
    expect(fila()).toEqual(['Sala 5 (CASJ · filial 13) Pendente']);

    tela().onFilialChange('2');
    expect(fila()).toEqual(['Sala 17 (CASJ · filial 2) Aprovada', 'Sala 17 (CASJ · filial 2) Pendente']);
  });

  it('filial sem solicitação: a fila vazia diz qual é', () => {
    tela().onFilialChange('16');
    fixture.detectChanges();
    expect(fila()).toEqual([]);
    expect(tela().filaVazia()).toBe('Nenhuma solicitação da CASJ · filial 16');
    expect(el().textContent).toContain('Nenhuma solicitação da CASJ · filial 16');
  });

  it('a unidade também filtra a fila; a filial de outra unidade volta para "Todas"', () => {
    tela().onFilialChange('13');
    tela().onUnidadeChange('sul');
    expect(tela().filial()).toBe('todas');
    expect(fila()).toEqual(['Sala 1 (Sul · filial 6) Recusada']);

    tela().onUnidadeChange('casj');
    expect(fila()).toEqual([
      'Sala 5 (CASJ · filial 13) Pendente',
      'Sala 17 (CASJ · filial 2) Aprovada',
      'Sala 17 (CASJ · filial 2) Pendente',
    ]);
  });

  it('no formulário, as salas de várias filiais levam o nome da filial; numa filial só, não', () => {
    expect(tela().salaOptions().map((o) => o.label)).toEqual([
      'Sala 17 · CASJ · filial 2',
      'Sala 5 · CASJ · filial 13',
      'Sala 40 · CASJ · filial 16',
      'Sala 1 · Sul · filial 6',
    ]);
    tela().onFilialChange('13');
    expect(tela().salaOptions().map((o) => o.label)).toEqual(['Sala 5']);
  });
});
