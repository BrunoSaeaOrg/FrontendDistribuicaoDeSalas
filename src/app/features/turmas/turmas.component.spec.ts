import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiSalaDoAnoDto, ApiTurmaDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { RegrasService } from '../../core/services/regras.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
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

describe('TurmasComponent: turno indisponível', () => {
  let definir: ReturnType<typeof vi.fn>;
  let confirmar: ReturnType<typeof vi.fn>;

  const livre = (codTurma: string, nome: string, turno: string): ApiTurmaDto => ({
    ANOLETIVO: '2026',
    IDPERLET: 222,
    CODFILIAL: 2,
    UNIDADE: 'CASJ',
    SEGMENTO: 'Anos Iniciais',
    CODTURMA: codTurma,
    TURMA: nome,
    TURNO: turno,
    OCUPACAO: 25,
  });

  /** O RM devolve o MOTIVO inteiro que ficou gravado (o back junta os turnos). */
  function criar(gravado: string | null | Error = null, aceitar = true) {
    definir = vi.fn(() => (gravado instanceof Error ? throwError(() => ({ error: { message: gravado.message } })) : of({ motivo: gravado })));
    confirmar = vi.fn(() => Promise.resolve(aceitar));
    TestBed.configureTestingModule({
      imports: [TurmasComponent],
      providers: [
        {
          provide: OcupacaoApiService,
          useValue: {
            // A Sala 17 está com a tarde indisponível; há uma turma sem sala em cada turno.
            getSalasDoAno: () => of([{ ...sala(2, 'CASJ', '17'), MOTIVO: 'Tarde: Reservada' }]),
            getTurmasXSalas: () => of([]),
            getTurmas: () => of([livre('EF5A-M', '5º Ano A - Manhã', 'Manhã'), livre('EF5B-T', '5º Ano B - Tarde', 'Tarde')]),
            getAnosLetivos: () => of([]),
            definirIndisponibilidade: definir,
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        { provide: RegrasService, useValue: { regrasDaFilial: () => ({ areaPorAluno: 1.5, pctMaximoUtilizacao: 90, permitirExcesso: false }), carregarFiliais: () => {} } },
        { provide: ConfirmDialogService, useValue: { confirm: confirmar } },
      ],
    });
    const fixture = TestBed.createComponent(TurmasComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const celula = (tela: TurmasComponent, turno: 'manha' | 'tarde') => tela.rows()[0].cells.find((c) => c.turno === turno)!;
  const acoes = (tela: TurmasComponent, turno: 'manha' | 'tarde') => celula(tela, turno).acoes.map((a) => a.label);
  const opcoes = (tela: TurmasComponent, turno: 'manha' | 'tarde') => celula(tela, turno).opcoes.map((o) => o.codTurma);

  it('o seletor de cada turno termina com a ação de marcar; indisponível, não oferece turma e troca as ações', () => {
    const tela = criar();

    expect([celula(tela, 'manha').motivoIndisponivel, opcoes(tela, 'manha'), acoes(tela, 'manha')]).toEqual([
      null,
      ['EF5A-M'],
      ['Marcar manhã como indisponível'],
    ]);
    expect([celula(tela, 'tarde').motivoIndisponivel, opcoes(tela, 'tarde'), acoes(tela, 'tarde')]).toEqual([
      'Reservada',
      [],
      ['Alterar motivo', 'Tornar tarde disponível'],
    ]);
    // O motivo fica no lugar do texto do seletor.
    expect(celula(tela, 'tarde').textoDoSeletor).toBe('Reservada');
  });

  it('marcar a manhã abre o diálogo e grava só a manhã; a célula muda na hora', () => {
    const tela = criar('Manhã: Pintura\nTarde: Reservada');
    const row = tela.rows()[0];

    tela.aoEscolherAcao(row, celula(tela, 'manha'), 'indisponivel');
    expect(tela.dialogoMotivo()).toBe(true);
    // O campo do RM é dos dois turnos: 500 menos "Manhã: ", a quebra de linha e "Tarde: Reservada".
    expect(tela.alvoDoMotivo()).toMatchObject({ turno: 'manha', motivoAtual: null, limite: 500 - 7 - 1 - 16 });
    expect(tela.tituloMotivo()).toBe('Manhã indisponível · Sala 17');

    tela.motivo.set('  Pintura ');
    tela.salvarMotivo();

    expect(definir).toHaveBeenCalledWith(expect.objectContaining({ codSala: '17', turno: 'manha', motivo: 'Pintura' }));
    expect(tela.dialogoMotivo()).toBe(false);
    expect([celula(tela, 'manha').motivoIndisponivel, opcoes(tela, 'manha')]).toEqual(['Pintura', []]);
    expect(celula(tela, 'tarde').motivoIndisponivel).toBe('Reservada');
  });

  it('"Alterar motivo" abre o diálogo com o motivo de agora', () => {
    const tela = criar();

    tela.aoEscolherAcao(tela.rows()[0], celula(tela, 'tarde'), 'motivo');
    expect([tela.motivo(), tela.alvoDoMotivo()?.motivoAtual]).toEqual(['Reservada', 'Reservada']);
  });

  it('tornar a tarde disponível pelo seletor confirma antes; recusado, não grava', async () => {
    const tela = criar(null);

    tela.aoEscolherAcao(tela.rows()[0], celula(tela, 'tarde'), 'disponivel');
    await vi.waitFor(() => expect(definir).toHaveBeenCalled());

    expect(confirmar).toHaveBeenCalledWith(expect.objectContaining({ title: 'Tornar tarde disponível?' }));
    expect(definir).toHaveBeenCalledWith(expect.objectContaining({ turno: 'tarde', motivo: '' }));
    expect([celula(tela, 'tarde').motivoIndisponivel, opcoes(tela, 'tarde')]).toEqual([null, ['EF5B-T']]);
  });

  it('tornar disponível recusado na confirmação não grava nada', async () => {
    const tela = criar(null, false);

    tela.aoEscolherAcao(tela.rows()[0], celula(tela, 'tarde'), 'disponivel');
    await vi.waitFor(() => expect(confirmar).toHaveBeenCalled());
    await Promise.resolve();

    expect(definir).not.toHaveBeenCalled();
    expect(celula(tela, 'tarde').motivoIndisponivel).toBe('Reservada');
  });

  it('sem motivo não grava; se o RM recusa, avisa e o diálogo continua aberto', () => {
    const tela = criar(new Error('O RM recusou.'));
    const perigo = vi.spyOn(TestBed.inject(ToastService), 'danger');

    tela.aoEscolherAcao(tela.rows()[0], celula(tela, 'manha'), 'indisponivel');
    tela.motivo.set('   ');
    tela.salvarMotivo();
    expect(definir).not.toHaveBeenCalled();

    tela.motivo.set('Pintura');
    tela.salvarMotivo();
    expect(perigo).toHaveBeenCalledWith('Não foi possível gravar', 'O RM recusou.');
    expect(celula(tela, 'manha').motivoIndisponivel).toBeNull();
    expect([tela.dialogoMotivo(), tela.motivo(), tela.gravandoMotivo()]).toEqual([true, 'Pintura', null]);
  });
});
