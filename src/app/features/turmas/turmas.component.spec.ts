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

// A CASJ tem duas filiais (2 e 13), que viram uma unidade só pelo nome; a Sul tem a 6.
const SALAS = [sala(2, 'CASJ', '17'), sala(13, 'CASJ', '5'), sala(6, 'Sul', '1')];

describe('TurmasComponent: filtro de filial', () => {
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
        { provide: RegrasService, useValue: { regras: signal({ pctMaximoUtilizacao: 90 }) } },
      ],
    });
    const fixture = TestBed.createComponent(TurmasComponent);
    fixture.detectChanges();
    return fixture;
  }

  const salas = (tela: TurmasComponent) => tela.rows().map((r) => r.nome);
  const rotulos = (tela: TurmasComponent) => tela.filialOptions().map((o) => o.label);

  it('lista cada filial com o nome da unidade, e escolher uma deixa só as salas dela', () => {
    const fixture = criar();
    const tela = fixture.componentInstance;

    expect(rotulos(tela)).toEqual(['Todas as filiais', 'CASJ · filial 2', 'Sul · filial 6', 'CASJ · filial 13']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Filial');
    expect(salas(tela)).toEqual(['Sala 17', 'Sala 5', 'Sala 1']);

    tela.filial.set('13');
    expect(salas(tela)).toEqual(['Sala 5']);
  });

  it('com uma unidade, só as filiais dela; a filial de outra unidade volta para "Todas"', () => {
    const tela = criar().componentInstance;

    tela.selecionarUnidade('casj');
    expect(rotulos(tela)).toEqual(['Todas as filiais', 'CASJ · filial 2', 'CASJ · filial 13']);

    // A 13 é da CASJ: continua ao trocar de "Todas" para CASJ e de volta.
    tela.filial.set('13');
    tela.selecionarUnidade('todas');
    expect(tela.filial()).toBe('13');
    tela.selecionarUnidade('casj');
    expect(tela.filial()).toBe('13');
    expect(salas(tela)).toEqual(['Sala 5']);

    // A Sul não tem a 13: a filial volta para "Todas" e aparecem as salas da Sul.
    tela.selecionarUnidade('sul');
    expect(tela.filial()).toBe('todas');
    expect(salas(tela)).toEqual(['Sala 1']);
  });
});
