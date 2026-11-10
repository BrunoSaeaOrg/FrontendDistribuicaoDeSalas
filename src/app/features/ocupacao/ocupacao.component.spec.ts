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
        { provide: RegrasService, useValue: { regrasDaFilial: (codFilial: number) => ({ areaPorAluno: 1.5, pctMaximoUtilizacao: codFilial === 13 ? 80 : 90, permitirExcesso: false }), carregarFiliais: () => {} } },
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

  it('a tabela mostra a faixa da regra de cada unidade: 20 de 30 com 90% disponível, 25 de 30 com 80% quase lotada', () => {
    const situacao = Object.fromEntries(
      [...el().querySelectorAll('.ocup-table tbody tr')].map((tr) => {
        const td = tr.querySelectorAll('td');
        const faixa = td[6].querySelector('.ocup-faixa')!;
        return [td[0].textContent!.trim(), `${faixa.querySelector('.material-icons')!.textContent} ${faixa.lastChild!.textContent!.trim()}`];
      }),
    );
    expect(situacao).toEqual({ 'CASJ 1': 'check_circle Disponível', 'CASJ 2': 'warning Quase lotada' });
    expect(el().querySelector('.ocup-table tfoot')!.textContent).toContain('Total');
  });

  it('as abas são Tabela, Gráfico e Comparar anos (a Evolução com dados inventados saiu)', () => {
    expect(abas().map((a) => a.lastChild!.textContent!.trim())).toEqual(['Tabela', 'Gráfico', 'Comparar anos']);

    abas()[1].click();
    fixture.detectChanges();
    const linhas = [...el().querySelectorAll('.ocup-graf-lista li')];
    expect(linhas.map((li) => li.getAttribute('aria-label'))).toEqual([
      'CASJ 2: 83% de ocupação, 25 alunos em 30 lugares, Quase lotada',
      'CASJ 1: 67% de ocupação, 20 alunos em 30 lugares, Disponível',
    ]);
  });
});

describe('OcupacaoComponent: Comparar anos', () => {
  let fixture: ComponentFixture<OcupacaoComponent>;
  const el = () => fixture.nativeElement as HTMLElement;
  const tela = () => fixture.componentInstance;
  const pedidos: string[] = [];

  /** 2025: as mesmas salas, com menos alunos (15 e 20). */
  const doAno = (ano: string) => {
    const salas = SALAS.map((s) => ({ ...s, ANO: ano }));
    const turmas = ano === '2025' ? [turma(2, 'CASJ', 'EF3A-M', 15), turma(13, 'CASJ', 'EF4A-M', 20)] : TURMAS;
    return { salas, turmas, vinculos: [vinculo(turmas[0], salas[0]), vinculo(turmas[1], salas[1])] };
  };

  beforeEach(async () => {
    pedidos.length = 0;
    TestBed.configureTestingModule({
      imports: [OcupacaoComponent],
      providers: [
        {
          provide: OcupacaoApiService,
          useValue: {
            getSalasDoAno: (_: string, ano: string) => {
              pedidos.push(ano);
              return of(doAno(ano).salas);
            },
            getTurmasXSalas: (_: string, ano: string) => of(doAno(ano).vinculos),
            getTurmas: (_: string, ano: string) => of(doAno(ano).turmas),
            getAnosLetivos: () => of([{ ANO: '2025' }, { ANO: '2026' }]),
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

  it('só lê os outros anos ao abrir a aba, e mostra a variação entre eles', async () => {
    const antes = pedidos.length;
    tela().onVisChange('anos');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // O ano em uso (2026) já está no SalasService: só 2025 vai ao RM.
    expect(pedidos.slice(antes)).toEqual(['2025']);
    const cmp = tela().comparacao();
    expect(cmp.colunas.map((c) => [c.ano, c.estado, c.resumo?.alunos])).toEqual([
      ['2025', 'pronto', 35],
      ['2026', 'pronto', 45],
    ]);
    expect(cmp.linhas.map((l) => [l.label, l.variacao?.texto])).toEqual([
      ['CASJ 1', '+17 p.p.'],
      ['CASJ 2', '+17 p.p.'],
    ]);
    expect(el().querySelector('.ocup-table--anos thead')!.textContent).toContain('2025 → 2026');
  });
});
