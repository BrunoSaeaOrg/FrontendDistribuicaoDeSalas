import { TestBed } from '@angular/core/testing';
import { VincularAlunosComponent } from './vincular-alunos.component';
import { SEM_TURMA } from './vincular-alunos.mock';

describe('VincularAlunosComponent (protótipo)', () => {
  let tela: VincularAlunosComponent;

  // O jsdom não tem DragEvent: basta o que a tela usa dele.
  const arraste = () => ({ dataTransfer: null, preventDefault: () => {} }) as unknown as DragEvent;
  const grupo = (id: string) => tela.grupos().find((g) => g.id === id)!;
  const ids = (id: string) => grupo(id).alunos.map((a) => a.id);

  beforeEach(() => {
    const fixture = TestBed.createComponent(VincularAlunosComponent);
    fixture.detectChanges();
    tela = fixture.componentInstance;
    tela.selecionarAno('2026');
    // Sala 12: 1º Ano A (26) de manhã e 1º Ano C (18) à tarde; 14 alunos do ano sem turma.
    tela.selecionarSala('2026-S12');
  });

  it('ano e sala trazem os alunos das turmas da sala e, por último, os sem turma', () => {
    expect(tela.grupos().map((g) => [g.id, g.alunos.length])).toEqual([
      ['2026-1A', 26],
      ['2026-1C', 18],
      [SEM_TURMA, 14],
    ]);
    expect(tela.turmasDaSala().map((t) => t.id)).toEqual(['2026-1A', '2026-1C']);
    expect(tela.totalNaSala()).toBe(44);
  });

  it('marcados de grupos diferentes vão para o topo da turma; quem já está nela fica', () => {
    const daA = ids('2026-1A')[0];
    const daC = ids('2026-1C')[0];
    const semTurma = ids(SEM_TURMA)[0];
    [daA, daC, semTurma].forEach((id) => tela.alternarAluno(id, true));
    tela.escolherDestino('2026-1C');

    tela.moverSelecionados();

    expect(ids('2026-1C')).toHaveLength(20);
    expect(ids('2026-1C').slice(0, 2).sort()).toEqual([daA, semTurma].sort());
    expect(ids('2026-1C')).toContain(daC);
    expect(ids('2026-1A')).toHaveLength(25);
    expect(ids(SEM_TURMA)).toHaveLength(13);
    expect([...tela.recemMovidos()].sort()).toEqual([daA, semTurma].sort());
    expect(tela.qtdSelecionados()).toBe(0);
  });

  it('arrastar um aluno marcado leva todos os marcados; um não marcado vai sozinho', () => {
    const [a, b, c] = grupo(SEM_TURMA).alunos;
    tela.alternarAluno(a.id, true);
    tela.alternarAluno(b.id, true);

    tela.aoComecarArraste(b, arraste());
    tela.aoSoltar('2026-1A', arraste());
    expect(ids('2026-1A').slice(0, 2).sort()).toEqual([a.id, b.id].sort());
    expect(tela.destinoId()).toBe('2026-1A');

    tela.aoComecarArraste(c, arraste());
    tela.aoSoltar('2026-1C', arraste());
    expect(ids('2026-1C')[0]).toBe(c.id);
    expect(ids(SEM_TURMA)).toHaveLength(11);
  });

  it('passar das carteiras da sala marca a turma como excedida', () => {
    // Sala 13 (30 carteiras): 1º Ano B com 29.
    tela.selecionarSala('2026-S13');
    tela.alternarGrupo(grupo(SEM_TURMA), true);
    tela.escolherDestino('2026-1B');

    tela.moverSelecionados();

    const turma = tela.turmasDaSala().find((t) => t.id === '2026-1B')!;
    expect(turma.alunos).toHaveLength(43);
    expect(turma.excede).toBe(true);
    expect(turma.pct).toBe(100);
  });

  it('se todos os marcados já estão na turma de destino, nada muda', () => {
    tela.alternarAluno(ids('2026-1A')[0], true);
    tela.escolherDestino('2026-1A');

    tela.moverSelecionados();

    expect(ids('2026-1A')).toHaveLength(26);
    expect(tela.recemMovidos().size).toBe(0);
    expect(tela.qtdSelecionados()).toBe(0);
  });

  it('trocar a sala ou o ano limpa os marcados e o destino', () => {
    tela.alternarAluno(ids('2026-1A')[0], true);
    tela.escolherDestino('2026-1A');

    tela.selecionarSala('2026-S21');
    expect(tela.qtdSelecionados()).toBe(0);
    expect(tela.destinoId()).toBeNull();
    expect(tela.turmasDaSala().map((t) => t.id)).toEqual(['2026-6A', '2026-7A']);

    tela.selecionarAno('2025');
    expect(tela.salaId()).toBe('');
    expect(tela.grupos()).toEqual([]);
    expect(tela.salaOptions().map((o) => o.value)).toEqual(['', '2025-S12', '2025-S13']);
  });
});
