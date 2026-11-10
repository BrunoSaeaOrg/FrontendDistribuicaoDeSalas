import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiCopiaAnoPlanoDto, ApiCopiaSalaDto, ApiSituacaoCopiaAno } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { SalasService } from '../../core/services/salas.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { CopiarAnoComponent, SALAS_POR_LOTE } from './copiar-ano.component';

const sala = (n: number, situacao: ApiSituacaoCopiaAno = 'copiar', codFilial = 2): ApiCopiaSalaDto => ({
  id: `1|${codFilial}|100|1|1|1|${n}`,
  codFilial,
  unidade: 'Centro',
  andar: '1',
  sala: `Sala ${n}`,
  tipoSala: 'Sala de aula',
  carteiras: 30,
  capacidade: 33,
  carteirasNoDestino: situacao === 'atualizar' ? 25 : null,
  capacidadeNoDestino: situacao === 'atualizar' ? 33 : null,
  idPerletOrigem: 100,
  idPerletDestino: situacao === 'copiar' || situacao === 'atualizar' ? 200 : null,
  situacao,
});

const plano = (salas: ApiCopiaSalaDto[]): ApiCopiaAnoPlanoDto => ({ salas });

describe('CopiarAnoComponent (Salas por ano)', () => {
  const anoLetivo = signal('2026');
  const somenteLeitura = signal(false);
  let api: {
    getPlanoCopiaAno: ReturnType<typeof vi.fn>;
    copiarSalasDoAno: ReturnType<typeof vi.fn>;
    salvarTurmaXSala: ReturnType<typeof vi.fn>;
  };
  let carregar: ReturnType<typeof vi.fn>;

  async function criar(p: ApiCopiaAnoPlanoDto): Promise<ComponentFixture<CopiarAnoComponent>> {
    api.getPlanoCopiaAno.mockReturnValue(of(p));
    const fixture = TestBed.createComponent(CopiarAnoComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const texto = (fixture: ComponentFixture<CopiarAnoComponent>) => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const chave = (n: number, codFilial = 2) => `${codFilial}|1|1|${n}`;

  beforeEach(() => {
    anoLetivo.set('2026');
    somenteLeitura.set(false);
    api = {
      getPlanoCopiaAno: vi.fn(),
      copiarSalasDoAno: vi.fn((_usuario: string, _origem: string, _destino: string, ids: string[]) =>
        of(ids.map((id) => ({ id, situacao: 'criada' }))),
      ),
      salvarTurmaXSala: vi.fn(() => of({ sucesso: 1, concluido: true })),
    };
    carregar = vi.fn();
    TestBed.configureTestingModule({
      imports: [CopiarAnoComponent],
      providers: [
        { provide: OcupacaoApiService, useValue: api },
        {
          provide: SalasService,
          useValue: {
            anoLetivo,
            anosLetivos: signal(['2025', '2026', '2027']),
            carregar,
            filiais: signal(new Map()),
            nomeDaFilial: (c: string | number) => `Unidade ${c}`,
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        { provide: UiModeService, useValue: { readOnlyMode: somenteLeitura } },
      ],
    });
  });

  it('abre no ano da tela e no seguinte e já lista as salas por unidade, sem gravar nada', async () => {
    const fixture = await criar(plano([sala(1), sala(2, 'ja-existe'), sala(5, 'copiar', 13)]));
    const tela = fixture.componentInstance;

    expect([tela.anoOrigem(), tela.anoDestino()]).toEqual(['2026', '2027']);
    expect(api.getPlanoCopiaAno).toHaveBeenCalledExactlyOnceWith('bruno', '2026', '2027');
    expect(tela.grupos().map((g) => `${g.titulo}: ${g.linhas.map((l) => `${l.nome} (${l.selo.texto})`).join(', ')}`)).toEqual([
      'Centro 1: Sala 1 (Nova em 2027), Sala 2 (Igual)',
      'Centro 2: Sala 5 (Nova em 2027)',
    ]);
    expect(texto(fixture)).toContain('Salas por ano');
    expect(api.copiarSalasDoAno).not.toHaveBeenCalled();
  });

  it('a tabela tem só Unidade, Andar, Sala, Tipo, Carteiras e Capacidade (além da caixa de marcar)', async () => {
    const fixture = await criar(plano([sala(1), { ...sala(2, 'atualizar'), capacidadeNoDestino: 28 }]));
    const el = fixture.nativeElement as HTMLElement;

    expect([...el.querySelectorAll('thead th')].map((th) => th.textContent?.trim())).toEqual([
      '',
      'Unidade',
      'Andar',
      'Sala',
      'Tipo',
      'Carteiras',
      'Capacidade',
    ]);
    const celulas = (n: number) => [...el.querySelectorAll('tr.ca-sala')[n].querySelectorAll('td')].slice(1).map((td) => td.textContent?.trim());
    expect(celulas(0)).toEqual(['Centro', '1º andar', 'Sala 1', 'Sala de aula', '30', '33']);
    // O que o destino tem hoje e o que vai ficar, nas duas colunas de número.
    expect(celulas(1)).toEqual(['Centro', '1º andar', 'Sala 2', 'Sala de aula', '25 → 30', '28 → 33']);
  });

  it('a sala que só o ano de destino tem (ex.: Nova sala) aparece com "Só em 2027" e sem como marcar', async () => {
    const fixture = await criar(plano([sala(1), { ...sala(9, 'so-no-destino'), id: '1|2|200|1|1|1|9' }]));
    const tela = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;

    const nova = tela.grupos()[0].linhas.find((l) => l.nome === 'Sala 9')!;
    expect([nova.estado, nova.selo.texto, nova.aGravar]).toEqual(['destino', 'Só em 2027', 0]);
    expect(tela.grupos()[0].selecionaveis).toEqual([chave(1)]);
    const linha = [...el.querySelectorAll('tr.ca-sala')].find((tr) => tr.textContent?.includes('Sala 9'))!;
    expect(linha.querySelector('.ca-so-destino')?.textContent?.trim()).toBe('Só em 2027');
    expect(linha.classList.contains('ca-sala--igual')).toBe(false);
  });

  it('trocar o ano relê as salas; o mesmo ano nos dois não lê nada', async () => {
    const fixture = await criar(plano([sala(1)]));
    const tela = fixture.componentInstance;

    tela.escolherDestino('2026');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.getPlanoCopiaAno).toHaveBeenCalledTimes(1);
    expect(tela.temSalas()).toBe(false);
    expect(texto(fixture)).toContain('Escolha dois anos diferentes');

    tela.escolherOrigem('2025');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(api.getPlanoCopiaAno).toHaveBeenLastCalledWith('bruno', '2025', '2026');
  });

  it('o checkbox da unidade marca só as salas dela que têm algo a copiar; o cabeçalho não tem checkbox', async () => {
    const fixture = await criar(plano([sala(1), sala(2, 'ja-existe'), sala(3, 'atualizar')]));
    const tela = fixture.componentInstance;
    const filial = tela.grupos()[0];

    expect((fixture.nativeElement as HTMLElement).querySelector('thead saea-checkbox')).toBeNull();
    expect(tela.selecionaveis()).toEqual([chave(1), chave(3)]);
    expect(tela.textoBotao()).toBe('Copiar');
    expect(tela.podeCopiar()).toBe(false);

    tela.marcarFilial(filial, true);
    expect(tela.textoBotao()).toBe('Copiar 2 salas');
    expect(tela.filialMarcada(filial)).toBe(true);

    tela.marcar(chave(3), false);
    expect(tela.textoBotao()).toBe('Copiar 1 sala');
    expect([tela.filialMarcada(filial), tela.filialEmParte(filial)]).toEqual([false, true]);
  });

  it('Copiar grava só os registros das salas marcadas e não mexe em turma', async () => {
    const fixture = await criar(plano([sala(1), sala(2, 'atualizar'), sala(3)]));
    const tela = fixture.componentInstance;

    const sala2 = tela.grupos()[0].linhas.find((l) => l.chave === chave(2))!;
    expect([sala2.carteiras, sala2.selo.texto]).toEqual(['25 → 30', 'Carteiras diferentes']);
    expect(texto(fixture)).not.toContain('Turmas</th>');

    tela.marcar(chave(1), true);
    tela.marcar(chave(2), true);
    await tela.copiar();

    expect(api.copiarSalasDoAno).toHaveBeenCalledExactlyOnceWith('bruno', '2026', '2027', [sala(1).id, sala(2).id]);
    expect(api.salvarTurmaXSala).not.toHaveBeenCalled();
    // Relê o RM depois de gravar; a seleção sai, porque nada falhou.
    expect(api.getPlanoCopiaAno).toHaveBeenCalledTimes(2);
    expect(tela.selecionadas().size).toBe(0);
    expect(tela.copiando()).toBe(false);
  });

  it(`grava os registros em lotes de ${SALAS_POR_LOTE}`, async () => {
    const tela = (await criar(plano(Array.from({ length: 23 }, (_, i) => sala(i + 1))))).componentInstance;
    tela.grupos().forEach((g) => tela.marcarFilial(g, true));
    await tela.copiar();
    expect(api.copiarSalasDoAno.mock.calls.map((c) => (c[3] as string[]).length)).toEqual([10, 10, 3]);
  });

  it('a sala que falhou fica marcada, com o motivo, para copiar de novo', async () => {
    const fixture = await criar(plano([sala(1), sala(2)]));
    const tela = fixture.componentInstance;
    api.copiarSalasDoAno.mockReturnValue(
      of([
        { id: sala(1).id, situacao: 'criada' },
        { id: sala(2).id, situacao: 'falhou', erro: 'Sem permissão no RM.' },
      ]),
    );

    tela.grupos().forEach((g) => tela.marcarFilial(g, true));
    await tela.copiar();
    fixture.detectChanges();

    expect([...tela.selecionadas()]).toEqual([chave(2)]);
    const sala2 = tela.grupos()[0].linhas.find((l) => l.chave === chave(2))!;
    expect([sala2.estado, sala2.erro]).toEqual(['falhou', 'Sem permissão no RM.']);
    expect(texto(fixture)).toContain('Sem permissão no RM.');
  });

  it('unidade sem período no destino aparece só com o motivo, sem salas para marcar', async () => {
    const fixture = await criar(plano([sala(1), sala(7, 'sem-periodo', 16), sala(8, 'sem-periodo', 16)]));
    const tela = fixture.componentInstance;

    const filial16 = tela.grupos().find((g) => g.codFilial === 16)!;
    expect(filial16.linhas).toEqual([]);
    expect(filial16.motivo).toBe('Ainda não tem período letivo em 2027. Depois de criar, as salas aparecem aqui.');
    expect(tela.selecionaveis()).toEqual([chave(1)]);
    expect(texto(fixture)).toContain('Ainda não tem período letivo em 2027');
  });

  it('unidade com mais de um período no destino aparece só com o motivo', async () => {
    const tela = (await criar(plano([sala(1, 'periodo-ambiguo', 7)]))).componentInstance;

    const [filial7] = tela.grupos();
    expect(filial7.linhas).toEqual([]);
    expect(filial7.motivo).toBe('Tem mais de um período letivo em 2027: não dá para saber em qual gravar.');
  });

  it('a unidade escolhida deixa só as salas dela na tela, e Copiar grava só as dela', async () => {
    const fixture = await criar(plano([sala(1), sala(2), sala(5, 'copiar', 13), sala(6, 'ja-existe', 13)]));
    const tela = fixture.componentInstance;

    expect(tela.unidadeOptions().map((o) => o.label)).toEqual(['Centro 1', 'Centro 2']);
    expect(texto(fixture)).toContain('Unidade');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-select[label="Filial"]')).toBeNull();

    tela.grupos().forEach((g) => tela.marcarFilial(g, true));
    expect(tela.textoBotao()).toBe('Copiar 3 salas');

    // Trocar a unidade tira as marcadas: o Copiar é só do que está na tela.
    tela.escolherUnidades(['13']);
    fixture.detectChanges();
    expect(tela.grupos().map((g) => g.codFilial)).toEqual([13]);
    expect(tela.selecionadas().size).toBe(0);
    expect(texto(fixture)).not.toContain('Sala 1');
    expect(api.getPlanoCopiaAno).toHaveBeenCalledTimes(1);

    tela.marcarFilial(tela.grupos()[0], true);
    expect(tela.textoBotao()).toBe('Copiar 1 sala');
    await tela.copiar();
    expect(api.copiarSalasDoAno).toHaveBeenCalledExactlyOnceWith('bruno', '2026', '2027', [sala(5, 'copiar', 13).id]);
    // Relido o plano, a unidade continua a mesma.
    expect(tela.unidades()).toEqual(['13']);

    tela.escolherUnidades([]);
    expect(tela.grupos().map((g) => g.codFilial)).toEqual([2, 13]);
  });

  it('com várias unidades marcadas, a lista mostra só elas e o aviso fala das unidades marcadas', async () => {
    const fixture = await criar(plano([sala(1), sala(5, 'copiar', 13), { ...sala(9, 'copiar', 6), unidade: 'Sul' }]));
    const tela = fixture.componentInstance;
    expect(tela.unidadeOptions().map((o) => o.label)).toEqual(['Centro 1', 'Centro 2', 'Sul']);

    tela.escolherUnidades(['13', '6']);
    expect(tela.grupos().map((g) => g.titulo)).toEqual(['Centro 2', 'Sul']);

    // Um ano sem nenhuma das duas: o aviso não diz um nome só.
    api.getPlanoCopiaAno.mockReturnValue(of(plano([sala(1)])));
    tela.escolherOrigem('2025');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(texto(fixture)).toContain('Nenhuma sala das unidades marcadas em 2025');
    // A filial 2 continua "Centro 1": o número não muda num ano com menos filiais.
    expect(tela.unidadeOptions().map((o) => o.label)).toEqual(['Centro 1', 'Centro 2', 'Sul']);
  });

  it('trocar os anos não muda a unidade; num ano sem salas dela, a lista fica vazia com o aviso', async () => {
    const fixture = await criar(plano([sala(1), sala(5, 'copiar', 13)]));
    const tela = fixture.componentInstance;
    tela.escolherUnidades(['13']);

    // 2025 → 2026 só tem a filial 2: a 13 continua escolhida, com o nome, e a lista avisa.
    api.getPlanoCopiaAno.mockReturnValue(of(plano([sala(1), sala(3)])));
    tela.escolherOrigem('2025');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tela.unidades()).toEqual(['13']);
    expect(tela.grupos()).toEqual([]);
    expect(tela.unidadeOptions().map((o) => o.label)).toEqual(['Centro 1', 'Centro 2']);
    expect(texto(fixture)).toContain('Nenhuma sala da Centro 2 em 2025');

    // De volta a 2026 → 2027: a 13 está lá de novo, sem precisar escolher outra vez.
    api.getPlanoCopiaAno.mockReturnValue(of(plano([sala(1), sala(5, 'copiar', 13)])));
    tela.escolherOrigem('2026');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(tela.unidades()).toEqual(['13']);
    expect(tela.grupos().map((g) => g.codFilial)).toEqual([13]);
  });

  it('o campo Unidade fica sempre na tela: com uma unidade só e, sem lista, desativado', async () => {
    const fixture = await criar(plano([sala(1), sala(2)]));
    const campo = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.ca-unidade-escolha button.ms-gatilho');
    expect(campo()).not.toBeNull();
    expect(fixture.componentInstance.unidadeOptions().map((o) => o.label)).toEqual(['Centro']);
    expect(campo()!.disabled).toBe(false);

    // Mesmo ano nos dois: não há lista, o campo continua lá, desativado.
    fixture.componentInstance.escolherDestino('2026');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(campo()).not.toBeNull();
    expect(campo()!.disabled).toBe(true);
  });

  it('quem é só leitura vê as salas, mas não marca nem copia', async () => {
    somenteLeitura.set(true);
    const fixture = await criar(plano([sala(1)]));
    const tela = fixture.componentInstance;

    expect(tela.temSalas()).toBe(true);
    expect(tela.selecionaveis()).toEqual([]);
    expect(texto(fixture)).toContain('Só quem pode editar consegue copiar ou criar salas.');
    tela.marcar(chave(1), true);
    await tela.copiar();
    expect(api.copiarSalasDoAno).not.toHaveBeenCalled();
  });

  it('recarrega as salas do app quando a tela está no ano que recebeu a cópia', async () => {
    anoLetivo.set('2027');
    const fixture = await criar(plano([sala(1)]));
    const tela = fixture.componentInstance;
    tela.escolherOrigem('2026');
    tela.escolherDestino('2027');
    fixture.detectChanges();
    await fixture.whenStable();

    tela.grupos().forEach((g) => tela.marcarFilial(g, true));
    await tela.copiar();
    expect(carregar).toHaveBeenCalledTimes(1);
  });
});
