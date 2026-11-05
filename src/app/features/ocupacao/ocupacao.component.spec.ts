import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiSalaDoAnoDto, ApiTurmaDto, ApiTurmaXSalaDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { RegrasService } from '../../core/services/regras.service';
import { OcupacaoComponent } from './ocupacao.component';

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

const turma = (codFilial: number, unidade: string, codTurma: string, alunos: number): ApiTurmaDto => ({
  ANOLETIVO: '2026',
  IDPERLET: 222,
  CODFILIAL: codFilial,
  UNIDADE: unidade,
  SEGMENTO: 'Fundamental I',
  CODTURMA: codTurma,
  TURMA: `Turma ${codTurma}`,
  TURNO: 'Manhã',
  OCUPACAO: alunos,
});

const vinculo = (t: ApiTurmaDto, s: ApiSalaDoAnoDto): ApiTurmaXSalaDto => ({
  ...s,
  UNIDADE: t.UNIDADE,
  ANOLETIVO: t.ANOLETIVO,
  IDPERLET: t.IDPERLET,
  SEGMENTO: t.SEGMENTO,
  CODTURMA: t.CODTURMA,
  TURMA: t.TURMA,
  TURNO: t.TURNO,
  OCUPACAO: t.OCUPACAO,
  COMPOSICAO: `${t.CODTURMA} (${t.OCUPACAO})`,
});

const SALAS = [sala(2, 'CASJ', '17'), sala(13, 'CASJ', '5')];
const TURMAS = [turma(2, 'CASJ', 'EF3A-M', 20), turma(13, 'CASJ', 'EF4A-M', 25)];
const VINCULOS = [vinculo(TURMAS[0], SALAS[0]), vinculo(TURMAS[1], SALAS[1])];

describe('OcupacaoComponent: Unidade como filtro (nenhuma marcada = todas)', () => {
  let fixture: ComponentFixture<OcupacaoComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const tela = () => fixture.componentInstance;
  /** Os campos de filtro (o select nativo de cada app-select), pelo rótulo. */
  const campo = (rotulo: string) =>
    [...el().querySelectorAll('app-select')]
      .find((s) => s.querySelector('label')?.textContent?.trim() === rotulo)!
      .querySelector('select')!;
  const abas = () => [...el().querySelectorAll<HTMLButtonElement>('.ocup-tab')];

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [OcupacaoComponent],
      providers: [
        {
          provide: OcupacaoApiService,
          useValue: {
            getSalasDoAno: () => of(SALAS),
            getTurmasXSalas: () => of(VINCULOS),
            getTurmas: () => of(TURMAS),
            getAnosLetivos: () => of([]),
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        { provide: RegrasService, useValue: { regrasDaFilial: () => ({ areaPorAluno: 1.5, pctMaximoUtilizacao: 90, permitirExcesso: false }), carregarFiliais: () => {} } },
      ],
    });
    fixture = TestBed.createComponent(OcupacaoComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('abre sem unidade marcada: vale como todas, sem "*" e com filtros e abas ligados', () => {
    const rotulo = el().querySelector('app-multi-select label')!;
    expect(rotulo.querySelector('.ms-obrigatorio')).toBeNull();
    expect(el().querySelector('app-multi-select .ms-gatilho')!.textContent).toContain('Todas as unidades');

    expect(['Ano letivo', 'Turno', 'Segmento', 'Agrupar por'].map((r) => campo(r).disabled)).toEqual([false, false, false, false]);
    expect(abas().some((a) => a.disabled)).toBe(false);
    expect(tela().grupos().map((g) => `${g.label}: ${g.alunos}`).sort()).toEqual(['CASJ 1: 20', 'CASJ 2: 25']);
    expect(el().querySelector('.ocup-table')).not.toBeNull();
  });

  it('marcar uma unidade mostra só a ocupação dela; desmarcar volta a todas', () => {
    tela().selecionarUnidades(['13']);
    expect(tela().grupos().map((g) => `${g.label}: ${g.alunos}`)).toEqual(['CASJ 2: 25']);

    tela().selecionarUnidades([]);
    expect(tela().grupos().map((g) => g.label).sort()).toEqual(['CASJ 1', 'CASJ 2']);
  });
});
