import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiSalaDoAnoDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { RegrasService } from '../../core/services/regras.service';
import { TurmasComponent } from './turmas.component';

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

// A CASJ tem duas filiais (2 e 13), e cada uma é uma unidade; a Sul tem a 6.
const SALAS = [sala(2, 'CASJ', '17'), sala(13, 'CASJ', '5'), sala(6, 'Sul', '1')];

describe('TurmasComponent: filtro de unidade', () => {
  function criar() {
    TestBed.configureTestingModule({
      imports: [TurmasComponent],
      providers: [
        {
          provide: OcupacaoApiService,
          useValue: {
            getSalasDoAno: () => of(SALAS),
            getTurmasXSalas: () => of([]),
            getTurmas: () => of([]),
            getAnosLetivos: () => of([]),
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        { provide: RegrasService, useValue: { regrasDaFilial: () => ({ areaPorAluno: 1.5, pctMaximoUtilizacao: 90, permitirExcesso: false }), carregarFiliais: () => {} } },
      ],
    });
    const fixture = TestBed.createComponent(TurmasComponent);
    fixture.detectChanges();
    return fixture;
  }

  const salas = (tela: TurmasComponent) => tela.rows().map((r) => r.nome);
  const rotulos = (tela: TurmasComponent) => tela.unidadeOptions().map((o) => o.label);

  it('cada filial é uma unidade no campo Unidade, sem a palavra "filial", e não há mais campo Filial', () => {
    const fixture = criar();
    const tela = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;

    expect(rotulos(tela)).toEqual(['CASJ 1', 'CASJ 2', 'Sul']);
    expect(el.querySelector('app-select[label="Filial"]')).toBeNull();
    expect(el.querySelector('app-multi-select[label="Unidade"]')).not.toBeNull();
    expect(salas(tela)).toEqual(['Sala 17', 'Sala 5', 'Sala 1']);
  });

  it('as unidades marcadas deixam só as salas delas; nenhuma marcada mostra todas', () => {
    const tela = criar().componentInstance;

    tela.selecionarUnidades(['13']);
    expect(salas(tela)).toEqual(['Sala 5']);
    tela.selecionarUnidades(['2']);
    expect(salas(tela)).toEqual(['Sala 17']);
    tela.selecionarUnidades(['2', '6']);
    expect(salas(tela)).toEqual(['Sala 17', 'Sala 1']);
    tela.selecionarUnidades([]);
    expect(salas(tela)).toEqual(['Sala 17', 'Sala 5', 'Sala 1']);
  });
});
