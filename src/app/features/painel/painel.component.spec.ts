import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiSalaDoAnoDto, ApiTurmaDto, ApiTurmaXSalaDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { RegrasService } from '../../core/services/regras.service';
import { PainelComponent } from './painel.component';

// Sala 17 do CASJ em 2026: 28 alunos de manhã e 24 à tarde, capacidade 30 e limite de 90%.
const sala: ApiSalaDoAnoDto = {
  CODFILIAL: 2,
  FILIAL: 'CASJ',
  CODBLOCO: '1',
  CODPREDIO: '1',
  CODTIPOSALA: 1,
  TIPOSALA: 'Sala de aula',
  CODSALA: '17',
  SALA: 'Sala 17',
  ANDAR: '1',
  CARTEIRAS: 30,
  CAPACIDADE: 30,
  CAPACIDADEMAXIMA: 30,
  AREA: 45,
  IDPERLET: 222,
  ANO: '2026',
};

const vinculo = (codTurma: string, turma: string, turno: string, ocupacao: number, composicao: string): ApiTurmaXSalaDto => ({
  ...sala,
  UNIDADE: 'CASJ',
  ANOLETIVO: '2026',
  CODTURMA: codTurma,
  TURMA: turma,
  TURNO: turno,
  OCUPACAO: ocupacao,
  COMPOSICAO: composicao,
});

const turma = (codTurma: string, nome: string, turno: string, ocupacao: number): ApiTurmaDto => ({
  ANOLETIVO: '2026',
  IDPERLET: 222,
  CODFILIAL: 2,
  UNIDADE: 'CASJ',
  SEGMENTO: 'Anos Iniciais',
  CODTURMA: codTurma,
  TURMA: nome,
  TURNO: turno,
  OCUPACAO: ocupacao,
});

const manha = vinculo('EF4A-M', '4º Ano A - Manhã', 'Manhã', 28, 'EF4A-M (22) + EF4A-SM (4) + EF4A-I (2)');
const tarde = vinculo('EF4H-T', '4º Ano H - Tarde', 'Tarde', 24, 'EF4H-ST (2) + EF4H-T (22)');

describe('PainelComponent: filtro de turno', () => {
  function criar(vinculos: ApiTurmaXSalaDto[] = [manha, tarde]) {
    TestBed.configureTestingModule({
      imports: [PainelComponent],
      providers: [
        provideRouter([]),
        {
          provide: OcupacaoApiService,
          useValue: {
            getSalasDoAno: () => of([sala]),
            getTurmasXSalas: () => of(vinculos),
            getTurmas: () =>
              of([
                turma('EF4A-M', '4º Ano A - Manhã', 'Manhã', 22),
                turma('EF4A-SM', '4º Ano A - Semi-Manhã', 'Manhã', 4),
                turma('EF4A-I', '4º Ano A - Integral', 'Integral', 2),
                turma('EF4H-T', '4º Ano H - Tarde', 'Tarde', 22),
                turma('EF4H-ST', '4º Ano H - Semi-Tarde', 'Tarde', 2),
              ]),
            getAnosLetivos: () => of([]),
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        { provide: RegrasService, useValue: { regras: signal({ pctMaximoUtilizacao: 90 }) } },
      ],
    });
    const fixture = TestBed.createComponent(PainelComponent);
    fixture.detectChanges();
    return fixture;
  }

  /** "Sala 17: manhã/tarde · status do filtro"; "—" é turno sem turma. */
  const linha = (painel: PainelComponent) =>
    painel.rows().map((r) => `${r.nome}: ${r.periodos.map((p) => p.alunos ?? '—').join('/')} · ${r.statusKey}`);

  it('Alunos mostra os de manhã e à tarde; o status do filtro é do turno mais cheio ou do filtrado', () => {
    const painel = criar().componentInstance;
    expect(linha(painel)).toEqual(['Sala 17: 28/24 · quase']);

    painel.turno.set('manha');
    expect(linha(painel)).toEqual(['Sala 17: 28/24 · quase']);

    painel.turno.set('tarde');
    expect(linha(painel)).toEqual(['Sala 17: 28/24 · disponivel']);
  });

  it('o cabeçalho tem Alunos sobre Manhã e Tarde, e não tem mais Status', () => {
    const fixture = criar();
    const cabecalho = (fixture.nativeElement as HTMLElement).querySelectorAll('thead tr');
    const textos = (tr: Element) => [...tr.querySelectorAll('th')].map((th) => th.textContent?.trim());

    expect(textos(cabecalho[0])).toEqual(['Unidade', 'Andar', 'Sala', 'Tipo', 'Carteiras', 'Capacidade', 'Alunos', 'Turmas', '']);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-badge')).toBeNull();
    expect(textos(cabecalho[1])).toEqual(['Manhã', 'Tarde']);
    const celulas = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody td.painel-cell-periodo')];
    expect(celulas.map((td) => td.textContent?.trim())).toEqual(['28', '24']);
    // A dica lista as turmas do turno, uma por linha.
    expect(celulas[0].getAttribute('title')?.split('\n').sort()).toEqual([
      '4º Ano A - Integral · 2 alunos',
      '4º Ano A - Manhã · 22 alunos',
      '4º Ano A - Semi-Manhã · 4 alunos',
    ]);
  });

  it('as letras M e T ficam na cor do status da sala em cada turno, e cinza sem turma', () => {
    // Manhã 28 de 30 (passa dos 90%): quase lotada. Tarde 24 de 30: disponível.
    const fixture = criar();
    const chips = () =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('.painel-turno-chip')].map(
        (c) => `${c.textContent?.trim()} ${[...c.classList].find((k) => k.startsWith('painel-turno-chip--'))}`,
      );
    expect(chips()).toEqual(['M painel-turno-chip--warning', 'T painel-turno-chip--success']);
    expect(fixture.componentInstance.rows()[0].turnoChips[0].turma.split('\n')[0]).toBe('Manhã: Quase lotada');
    // O status em texto, para quem não vê a cor (leitor de tela).
    const rotulos = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.painel-turno-chip')].map((c) => [
      c.getAttribute('role'),
      c.getAttribute('aria-label'),
    ]);
    expect(rotulos).toEqual([
      ['img', 'Manhã: Quase lotada'],
      ['img', 'Tarde: Disponível'],
    ]);

    // A cor é de cada turno, não do filtro: filtrar Tarde não muda a da manhã.
    fixture.componentInstance.turno.set('tarde');
    fixture.detectChanges();
    expect(chips()).toEqual(['M painel-turno-chip--warning', 'T painel-turno-chip--success']);
  });

  it('turno sem turma: letra cinza', () => {
    const fixture = criar([manha]);
    const tons = fixture.componentInstance.rows()[0].turnoChips.map((c) => c.tom);
    expect(tons).toEqual(['warning', null]);
    const livre = (fixture.nativeElement as HTMLElement).querySelectorAll('.painel-turno-chip--livre');
    expect(livre).toHaveLength(1);
    expect(livre[0].getAttribute('aria-label')).toBe('Tarde: livre');
  });

  it('turno sem turma aparece como "—"', () => {
    const painel = criar([manha]).componentInstance;
    expect(linha(painel)).toEqual(['Sala 17: 28/— · quase']);
    expect(painel.rows()[0].periodos[1].dica).toBe('Sem turma');
  });

  it('o filtro de status usa o status do turno escolhido', () => {
    const painel = criar().componentInstance;
    painel.status.set('quase');
    expect(painel.rows()).toHaveLength(1);

    // À tarde a Sala 17 tem 24 de 30: não está quase lotada.
    painel.turno.set('tarde');
    expect(painel.rows()).toHaveLength(0);
  });
});
