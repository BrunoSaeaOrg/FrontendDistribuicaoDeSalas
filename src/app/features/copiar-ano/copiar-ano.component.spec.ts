import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiCopiaAnoPlanoDto, ApiCopiaSalaDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { CopiarAnoComponent, SALAS_POR_LOTE } from './copiar-ano.component';

/** Sala do plano sem destino (a lista da tela): o que ela vira no destino só o backend sabe, na hora de copiar. */
const sala = (n: number, codFilial = 2): ApiCopiaSalaDto => ({
  id: `1|${codFilial}|100|1|1|1|${n}`,
  codFilial,
  unidade: 'Centro',
  andar: '1',
  sala: `Sala ${n}`,
  tipoSala: 'Sala de aula',
  carteiras: 30,
  capacidade: 33,
  carteirasNoDestino: null,
  capacidadeNoDestino: null,
  idPerletOrigem: 100,
  idPerletDestino: null,
  situacao: 'sem-destino',
});

const plano = (salas: ApiCopiaSalaDto[]): ApiCopiaAnoPlanoDto => ({ salas });

describe('CopiarAnoComponent (Sala por Ano Letivo)', () => {
  const anoLetivo = signal('2026');
  const somenteLeitura = signal(false);
  let api: {
    getPlanoCopiaAno: ReturnType<typeof vi.fn>;
    copiarSalasDoAno: ReturnType<typeof vi.fn>;
    salvarTurmaXSala: ReturnType<typeof vi.fn>;
  };
  let toast: Record<'success' | 'warning' | 'info' | 'danger', ReturnType<typeof vi.fn>>;
  let carregar: ReturnType<typeof vi.fn>;

  async function criar(p: ApiCopiaAnoPlanoDto): Promise<ComponentFixture<CopiarAnoComponent>> {
    api.getPlanoCopiaAno.mockReturnValue(of(p));
    const fixture = TestBed.createComponent(CopiarAnoComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  async function atualizar(fixture: ComponentFixture<CopiarAnoComponent>): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Marca as salas, abre o card de Copiar e confirma no ano que ele sugerir (ou no `destino`). */
  async function copiarPara(tela: CopiarAnoComponent, destino?: string): Promise<void> {
    tela.abrirCopia();
    if (destino) tela.anoDestino.set(destino);
    await tela.copiar();
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
    toast = { success: vi.fn(), warning: vi.fn(), info: vi.fn(), danger: vi.fn() };
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
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  it('abre no ano da tela e lista as salas dele por unidade, sem perguntar o destino nem gravar nada', async () => {
    const fixture = await criar(plano([sala(1), sala(2), sala(5, 13)]));
    const tela = fixture.componentInstance;

    expect(tela.anoOrigem()).toBe('2026');
    expect(api.getPlanoCopiaAno).toHaveBeenCalledExactlyOnceWith('bruno', '2026', '');
    expect(tela.grupos().map((g) => `${g.titulo}: ${g.linhas.map((l) => l.nome).join(', ')}`)).toEqual([
      'Centro 1: Sala 1, Sala 2',
      'Centro 2: Sala 5',
    ]);
    expect(texto(fixture)).toContain('Sala por Ano Letivo');
    expect(api.copiarSalasDoAno).not.toHaveBeenCalled();
  });

  it('a barra tem só Unidade e Ano letivo: o "Para" saiu da tela', async () => {
    const fixture = await criar(plano([sala(1)]));
    const el = fixture.nativeElement as HTMLElement;

    const rotulos = [...el.querySelectorAll('.ca-barra label')].map((l) => l.textContent?.trim());
    expect(rotulos).toContain('Ano letivo');
    expect(rotulos).not.toContain('Para');
    expect(rotulos).not.toContain('Copiar de');
    expect(fixture.componentInstance.dialogoCopiar()).toBe(false);
  });

  it('a tabela tem só Unidade, Andar, Sala, Tipo, Carteiras e Capacidade (além da caixa de marcar)', async () => {
    const fixture = await criar(plano([sala(1)]));
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
    const celulas = [...el.querySelectorAll('tr.ca-sala')[0].querySelectorAll('td')].slice(1).map((td) => td.textContent?.trim());
    expect(celulas).toEqual(['Centro', '1º andar', 'Sala 1', 'Sala de aula', '30', '33']);
  });

  it('sem ano não lê nada e pede o ano', async () => {
    const fixture = await criar(plano([sala(1)]));
    const tela = fixture.componentInstance;

    tela.escolherOrigem('');
    await atualizar(fixture);
    expect(api.getPlanoCopiaAno).toHaveBeenCalledTimes(1);
    expect(tela.plano()).toBeNull();
    expect(texto(fixture)).toContain('Escolha o ano');
  });

  it('trocar o ano relê as salas dele', async () => {
    const fixture = await criar(plano([sala(1)]));
    fixture.componentInstance.escolherOrigem('2025');
    await atualizar(fixture);
    expect(api.getPlanoCopiaAno).toHaveBeenLastCalledWith('bruno', '2025', '');
  });

  it('todas as salas dão para marcar; o checkbox da unidade marca as dela e o cabeçalho não tem checkbox', async () => {
    const fixture = await criar(plano([sala(1), sala(2), sala(3)]));
    const tela = fixture.componentInstance;
    const filial = tela.grupos()[0];

    expect((fixture.nativeElement as HTMLElement).querySelector('thead saea-checkbox')).toBeNull();
    expect(tela.selecionaveis()).toEqual([chave(1), chave(2), chave(3)]);
    expect(tela.textoBotao()).toBe('Copiar');
    expect(tela.podeCopiar()).toBe(false);

    tela.marcarFilial(filial, true);
    expect(tela.textoBotao()).toBe('Copiar 3 salas');
    expect(tela.filialMarcada(filial)).toBe(true);

    tela.marcar(chave(3), false);
    expect(tela.textoBotao()).toBe('Copiar 2 salas');
    expect([tela.filialMarcada(filial), tela.filialEmParte(filial)]).toEqual([false, true]);
  });

  it('Copiar abre o card perguntando o ano, já no seguinte; só grava ao confirmar', async () => {
    const fixture = await criar(plano([sala(1), sala(2), sala(3)]));
    const tela = fixture.componentInstance;

    // Sem sala marcada, o botão não abre nada.
    tela.abrirCopia();
    expect(tela.dialogoCopiar()).toBe(false);

    tela.marcar(chave(1), true);
    tela.marcar(chave(2), true);
    tela.abrirCopia();
    await atualizar(fixture);
    expect(tela.dialogoCopiar()).toBe(true);
    expect(tela.anoDestino()).toBe('2027');
    expect(tela.tituloCopiar()).toBe('Copiar 2 salas de 2026');
    // O ano das salas listadas não está entre as opções.
    expect(tela.anoDestinoOptions().map((o) => o.value)).toEqual(['', '2025', '2027']);
    expect(document.body.textContent).toContain('Para qual ano?');
    expect(api.copiarSalasDoAno).not.toHaveBeenCalled();

    await tela.copiar();
    expect(api.copiarSalasDoAno).toHaveBeenCalledExactlyOnceWith('bruno', '2026', '2027', [sala(1).id, sala(2).id]);
    expect(api.salvarTurmaXSala).not.toHaveBeenCalled();
    // O card fecha e a seleção sai, porque nada falhou; a lista (do ano de origem) não é relida.
    expect(tela.dialogoCopiar()).toBe(false);
    expect(tela.selecionadas().size).toBe(0);
    expect(tela.copiando()).toBe(false);
    expect(api.getPlanoCopiaAno).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledExactlyOnceWith('Cópia concluída', '2 salas copiadas para 2027.');
  });

  it('sem ano seguinte no RM, o card abre sem ano e não copia até escolher; o ano escolhido fica para a próxima', async () => {
    anoLetivo.set('2027');
    const fixture = await criar(plano([sala(1)]));
    const tela = fixture.componentInstance;

    tela.marcar(chave(1), true);
    tela.abrirCopia();
    expect(tela.anoDestino()).toBe('');
    expect(tela.podeConfirmar()).toBe(false);
    await tela.copiar();
    expect(api.copiarSalasDoAno).not.toHaveBeenCalled();

    // Cancelar fecha sem gravar.
    tela.fecharCopia();
    expect(tela.dialogoCopiar()).toBe(false);

    await copiarPara(tela, '2025');
    expect(api.copiarSalasDoAno).toHaveBeenCalledExactlyOnceWith('bruno', '2027', '2025', [sala(1).id]);

    tela.marcar(chave(1), true);
    tela.abrirCopia();
    expect(tela.anoDestino()).toBe('2025');
  });

  it(`grava os registros em lotes de ${SALAS_POR_LOTE}`, async () => {
    const tela = (await criar(plano(Array.from({ length: 23 }, (_, i) => sala(i + 1))))).componentInstance;
    tela.grupos().forEach((g) => tela.marcarFilial(g, true));
    await copiarPara(tela);
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
    await copiarPara(tela);
    fixture.detectChanges();

    expect([...tela.selecionadas()]).toEqual([chave(2)]);
    expect(tela.grupos()[0].linhas.find((l) => l.chave === chave(2))!.erro).toBe('Sem permissão no RM.');
    expect(texto(fixture)).toContain('Sem permissão no RM.');
    expect(toast.warning).toHaveBeenCalledWith(
      'Cópia concluída com pendências',
      '1 sala copiada para 2027, 1 não foi gravada. As que não gravaram continuam marcadas.',
    );
  });

  it('um lote que cai inteiro deixa as salas dele marcadas, com o motivo', async () => {
    const tela = (await criar(plano([sala(1)]))).componentInstance;
    api.copiarSalasDoAno.mockReturnValue(throwError(() => ({ error: { message: 'Servidor fora do ar.' } })));

    tela.marcar(chave(1), true);
    await copiarPara(tela);
    expect([...tela.selecionadas()]).toEqual([chave(1)]);
    expect(tela.grupos()[0].linhas[0].erro).toBe('Servidor fora do ar.');
  });

  it('unidade sem período letivo no destino fica de fora: o motivo vai no título dela e as salas continuam marcadas', async () => {
    const fixture = await criar(plano([sala(1), sala(7, 16), sala(8, 16)]));
    const tela = fixture.componentInstance;
    api.copiarSalasDoAno.mockImplementation((_u: string, _o: string, _d: string, ids: string[]) =>
      of(ids.map((id) => ({ id, situacao: id.split('|')[1] === '16' ? 'sem-periodo' : 'criada' }))),
    );

    tela.grupos().forEach((g) => tela.marcarFilial(g, true));
    await copiarPara(tela);
    fixture.detectChanges();

    const filial16 = tela.grupos().find((g) => g.codFilial === 16)!;
    expect(filial16.motivo).toBe('Não copiada: ainda não tem período letivo em 2027.');
    expect(filial16.linhas.length).toBe(2);
    expect([...tela.selecionadas()]).toEqual([chave(7, 16), chave(8, 16)]);
    expect(texto(fixture)).toContain('ainda não tem período letivo em 2027');
    expect(toast.warning).toHaveBeenCalledWith(
      'Cópia concluída com pendências',
      '1 sala copiada para 2027, 2 ficaram de fora (unidade sem período letivo). As que não gravaram continuam marcadas.',
    );
  });

  it('unidade com mais de um período no destino fica de fora com o motivo', async () => {
    const tela = (await criar(plano([sala(1, 7)]))).componentInstance;
    api.copiarSalasDoAno.mockReturnValue(of([{ id: sala(1, 7).id, situacao: 'periodo-ambiguo' }]));

    tela.marcar(chave(1, 7), true);
    await copiarPara(tela);
    expect(tela.grupos()[0].motivo).toBe('Não copiada: tem mais de um período letivo em 2027, não dá para saber em qual gravar.');
  });

  it('salas que já estavam iguais no destino: avisa que não havia nada a copiar e não recarrega', async () => {
    anoLetivo.set('2027');
    const fixture = await criar(plano([sala(1)]));
    const tela = fixture.componentInstance;
    tela.escolherOrigem('2026');
    await atualizar(fixture);
    api.copiarSalasDoAno.mockReturnValue(of([{ id: sala(1).id, situacao: 'ja-existe' }]));

    tela.marcar(chave(1), true);
    await copiarPara(tela, '2027');
    expect(toast.info).toHaveBeenCalledExactlyOnceWith('Nada a copiar', 'As salas marcadas já estavam iguais em 2027.');
    expect(tela.selecionadas().size).toBe(0);
    expect(carregar).not.toHaveBeenCalled();
  });

  it('a unidade escolhida deixa só as salas dela na tela, e Copiar grava só as dela', async () => {
    const fixture = await criar(plano([sala(1), sala(2), sala(5, 13), sala(6, 13)]));
    const tela = fixture.componentInstance;

    expect(tela.unidadeOptions().map((o) => o.label)).toEqual(['Centro 1', 'Centro 2']);
    expect(texto(fixture)).toContain('Unidade');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-select[label="Filial"]')).toBeNull();

    tela.grupos().forEach((g) => tela.marcarFilial(g, true));
    expect(tela.textoBotao()).toBe('Copiar 4 salas');

    // Trocar a unidade tira as marcadas: o Copiar é só do que está na tela.
    tela.escolherUnidades(['13']);
    fixture.detectChanges();
    expect(tela.grupos().map((g) => g.codFilial)).toEqual([13]);
    expect(tela.selecionadas().size).toBe(0);
    expect(texto(fixture)).not.toContain('Sala 1');
    expect(api.getPlanoCopiaAno).toHaveBeenCalledTimes(1);

    tela.marcar(chave(5, 13), true);
    expect(tela.textoBotao()).toBe('Copiar 1 sala');
    await copiarPara(tela);
    expect(api.copiarSalasDoAno).toHaveBeenCalledExactlyOnceWith('bruno', '2026', '2027', [sala(5, 13).id]);
    expect(tela.unidades()).toEqual(['13']);

    tela.escolherUnidades([]);
    expect(tela.grupos().map((g) => g.codFilial)).toEqual([2, 13]);
  });

  it('com várias unidades marcadas, a lista mostra só elas e o aviso fala das unidades marcadas', async () => {
    const fixture = await criar(plano([sala(1), sala(5, 13), { ...sala(9, 6), unidade: 'Sul' }]));
    const tela = fixture.componentInstance;
    expect(tela.unidadeOptions().map((o) => o.label)).toEqual(['Centro 1', 'Centro 2', 'Sul']);

    tela.escolherUnidades(['13', '6']);
    expect(tela.grupos().map((g) => g.titulo)).toEqual(['Centro 2', 'Sul']);

    // Um ano sem nenhuma das duas: o aviso não diz um nome só.
    api.getPlanoCopiaAno.mockReturnValue(of(plano([sala(1)])));
    tela.escolherOrigem('2025');
    await atualizar(fixture);
    expect(texto(fixture)).toContain('Nenhuma sala das unidades marcadas em 2025');
    // A filial 2 continua "Centro 1": o número não muda num ano com menos filiais.
    expect(tela.unidadeOptions().map((o) => o.label)).toEqual(['Centro 1', 'Centro 2', 'Sul']);
  });

  it('trocar o ano não muda a unidade; num ano sem salas dela, a lista fica vazia com o aviso', async () => {
    const fixture = await criar(plano([sala(1), sala(5, 13)]));
    const tela = fixture.componentInstance;
    tela.escolherUnidades(['13']);

    // 2025 só tem a filial 2: a 13 continua escolhida, com o nome, e a lista avisa.
    api.getPlanoCopiaAno.mockReturnValue(of(plano([sala(1), sala(3)])));
    tela.escolherOrigem('2025');
    await atualizar(fixture);
    expect(tela.unidades()).toEqual(['13']);
    expect(tela.grupos()).toEqual([]);
    expect(tela.unidadeOptions().map((o) => o.label)).toEqual(['Centro 1', 'Centro 2']);
    expect(texto(fixture)).toContain('Nenhuma sala da Centro 2 em 2025');

    // De volta a 2026: a 13 está lá de novo, sem precisar escolher outra vez.
    api.getPlanoCopiaAno.mockReturnValue(of(plano([sala(1), sala(5, 13)])));
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

    // Sem ano: não há lista, o campo continua lá, desativado.
    fixture.componentInstance.escolherOrigem('');
    await atualizar(fixture);
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
    tela.abrirCopia();
    expect(tela.dialogoCopiar()).toBe(false);
    await tela.copiar();
    expect(api.copiarSalasDoAno).not.toHaveBeenCalled();
  });

  it('recarrega as salas do app quando a tela está no ano que recebeu a cópia', async () => {
    anoLetivo.set('2027');
    const fixture = await criar(plano([sala(1)]));
    const tela = fixture.componentInstance;
    tela.escolherOrigem('2026');
    await atualizar(fixture);

    tela.grupos().forEach((g) => tela.marcarFilial(g, true));
    await copiarPara(tela, '2027');
    expect(carregar).toHaveBeenCalledTimes(1);
  });
});
