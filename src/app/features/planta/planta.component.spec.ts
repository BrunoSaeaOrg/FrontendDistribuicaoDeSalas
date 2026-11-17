import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { RegrasOcupacao } from '../../core/models';
import { ApiAlunoEnturmacaoDto, ApiSalaDoAnoDto, ApiTurmaDto, ApiTurmaXSalaDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { PlantaComponent } from './planta.component';

// Três salas da filial 2, todas com capacidade 30 e sem turma: com 50%, o limite é 15 carteiras.
const sala = (codSala: string, carteiras: number): ApiSalaDoAnoDto => ({
  CODFILIAL: 2,
  FILIAL: 'CASJ',
  CODBLOCO: '1',
  CODPREDIO: '1',
  CODTIPOSALA: 1,
  TIPOSALA: 'Sala de aula',
  CODSALA: codSala,
  SALA: `Sala ${codSala}`,
  ANDAR: '1',
  CARTEIRAS: carteiras,
  CAPACIDADE: 30,
  CAPACIDADEMAXIMA: 30,
  AREA: 45,
  IDPERLET: 222,
  ANO: '2026',
});

describe('PlantaComponent: limite da regra de ocupação', () => {
  let transferir: ReturnType<typeof vi.fn>;

  function criar(regras: Partial<RegrasOcupacao> = {}) {
    const daFilial: RegrasOcupacao = { areaPorAluno: 1.5, pctMaximoUtilizacao: 50, permitirExcesso: false, ...regras };
    transferir = vi.fn(() => of({ sucesso: 1 }));
    TestBed.configureTestingModule({
      imports: [PlantaComponent],
      providers: [
        provideRouter([]),
        {
          provide: OcupacaoApiService,
          useValue: {
            // Sala 1: 12 carteiras (cabem mais 3); Sala 2: 15 (no limite); Sala 3: 20 (já passou).
            getSalasDoAno: () => of([sala('1', 12), sala('2', 15), sala('3', 20)]),
            getTurmasXSalas: () => of([]),
            getTurmas: () => of([]),
            getAnosLetivos: () => of([]),
            transferirCarteira: transferir,
            getAlunosEnturmacao: () => of([]),
            getFotosEnturmacao: () => of({}),
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        { provide: RegrasService, useValue: { regrasDaFilial: () => daFilial, carregarFiliais: () => {} } },
      ],
    });
    const fixture = TestBed.createComponent(PlantaComponent);
    fixture.detectChanges();
    const salas = TestBed.inject(SalasService);
    const id = (nome: string) => salas.salas().find((s) => s.nome === nome)!.id;
    const planta = fixture.componentInstance;
    // A tela abre com todas as unidades; aqui marca só a da filial 2.
    planta.selecionarUnidades([salas.unidades()[0].id]);
    return { fixture, planta, salas, id };
  }

  const contar = (planta: PlantaComponent) => {
    const total: Record<string, number> = {};
    for (const d of planta.deskSlots()) total[d.kind] = (total[d.kind] ?? 0) + 1;
    return total;
  };

  it('capacidade 30 com 50%: só 15 espaços; o resto até 30 fica bloqueado', () => {
    const { planta, id } = criar();
    planta.salaId.set(id('Sala 1'));

    expect(planta.limite()).toBe(15);
    expect(planta.limiteLabel()).toBe('Limite de 15 carteiras (50% de 30)');
    expect(contar(planta)).toEqual({ vaga: 12, espaco: 3, bloqueado: 15 });
    expect(planta.deskSlots().some((d) => d.acimaDoLimite)).toBe(false);
  });

  it('sala que já passou do limite mostra as carteiras a mais marcadas', () => {
    const { planta, id } = criar();
    planta.salaId.set(id('Sala 3'));

    expect(planta.acimaDoLimite()).toBe(true);
    expect(contar(planta)).toEqual({ vaga: 20, bloqueado: 10 });
    expect(planta.deskSlots().filter((d) => d.acimaDoLimite).map((d) => d.index)).toEqual([15, 16, 17, 18, 19]);
    // O indicador do limite avisa (em laranja) quantas carteiras a sala já tem.
    expect(planta.indicadores()[3]).toEqual({ rotulo: 'Limite', valor: '15', sub: '50% de 30 · já tem 20', tom: 'aviso' });
    expect(planta.legenda().map((l) => l.rotulo)).toEqual(['Carteira vaga', 'Bloqueado pela regra', 'Acima do limite']);
  });

  it('a transferência só leva o que cabe no destino, e sala no limite não recebe', () => {
    const { planta, id } = criar();
    planta.salaId.set(id('Sala 3'));
    planta.abrirTransferModal();

    // Começa pela primeira que ainda recebe: a Sala 1, com espaço para 3.
    expect(planta.transferDestinoId()).toBe(id('Sala 1'));
    expect(planta.transferMaximo()).toBe(3);
    for (let i = 0; i < 10; i++) planta.transferQuantidadeMais();
    expect(planta.transferQuantidade()).toBe(3);

    planta.onTransferDestinoChange(id('Sala 2'));
    expect(planta.transferMaximo()).toBe(0);
    expect(planta.podeAvancarTransfer()).toBe(false);
    expect(planta.transferAvisoLimite()?.tone).toBe('danger');
  });

  it('soltar numa sala no limite não grava no RM', () => {
    const { planta, salas, id } = criar();
    const origem = salas.sala(id('Sala 3'))!;
    const destino = salas.sala(id('Sala 2'))!;

    expect(salas.transferirCarteira(origem, destino, 1)).toBe(false);
    expect(transferir).not.toHaveBeenCalled();

    // E o arraste nem libera o drop nela (sem preventDefault).
    planta.salaId.set(id('Sala 3'));
    planta.arrastando.set(true);
    const evento = { preventDefault: vi.fn(), dataTransfer: null } as unknown as DragEvent;
    planta.onOutraSalaDragOver(id('Sala 2'), evento);
    expect(evento.preventDefault).not.toHaveBeenCalled();
    planta.onOutraSalaDragOver(id('Sala 1'), evento);
    expect(evento.preventDefault).toHaveBeenCalled();
  });

  it('com "Permitir exceder" nada fica bloqueado: o que passa do limite só fica marcado', () => {
    const { planta, salas, id } = criar({ permitirExcesso: true });
    planta.salaId.set(id('Sala 1'));

    expect(planta.limiteLabel()).toBe('Limite de 15 carteiras (50% de 30), pode exceder');
    expect(contar(planta)).toEqual({ vaga: 12, espaco: 18 });
    expect(planta.deskSlots().filter((d) => d.acimaDoLimite)).toHaveLength(15);

    // Passar do limite vai, mas só com justificativa (que segue para o histórico).
    const origem = salas.sala(id('Sala 3'))!;
    const destino = salas.sala(id('Sala 2'))!;
    expect(salas.transferirCarteira(origem, destino, 2)).toBe(false);
    expect(salas.transferirCarteira(origem, destino, 2, '   ')).toBe(false);
    expect(transferir).not.toHaveBeenCalled();
    expect(salas.transferirCarteira(origem, destino, 2, '  Turma de reforço  ')).toBe(true);
    expect(transferir).toHaveBeenCalledTimes(1);
    expect(transferir).toHaveBeenCalledWith(expect.objectContaining({ quantidade: 2, justificativa: 'Turma de reforço' }));
  });

  it('dentro do limite a transferência não pede justificativa', () => {
    const { salas, id } = criar({ permitirExcesso: true });
    // Sala 1: 12 → 13, abaixo do limite de 15.
    expect(salas.precisaJustificativa(salas.sala(id('Sala 1'))!, 1)).toBe(false);
    expect(salas.transferirCarteira(salas.sala(id('Sala 3'))!, salas.sala(id('Sala 1'))!, 1)).toBe(true);
    expect(transferir).toHaveBeenCalledWith(expect.objectContaining({ justificativa: undefined }));
  });

  it('arrastando, a sala de destino mostra por que não recebe ou que vai pedir justificativa', () => {
    const aviso = (planta: PlantaComponent, nome: string) => planta.outrasSalas().find((s) => s.nome === nome)!.avisoNoArraste;

    const semExceder = criar();
    semExceder.planta.salaId.set(semExceder.id('Sala 3'));
    expect(aviso(semExceder.planta, 'Sala 2')).toEqual({
      tone: 'danger',
      text: 'No limite de 15 (50% da capacidade de 30): não recebe mais carteiras',
    });
    expect(aviso(semExceder.planta, 'Sala 1')).toBeNull();

    // Ao mostrar, a linha leva o texto (não só a dica do mouse).
    semExceder.planta.arrastando.set(true);
    semExceder.fixture.detectChanges();
    const linhas = [...(semExceder.fixture.nativeElement as HTMLElement).querySelectorAll('.planta-outra-row')];
    const sala2 = linhas.find((l) => l.querySelector('.planta-outra-nome')?.textContent?.trim() === 'Sala 2')!;
    expect(sala2.querySelector('.planta-outra-aviso')?.textContent).toContain('não recebe mais carteiras');

    TestBed.resetTestingModule();
    const podeExceder = criar({ permitirExcesso: true });
    podeExceder.planta.salaId.set(podeExceder.id('Sala 3'));
    expect(aviso(podeExceder.planta, 'Sala 2')?.tone).toBe('warning');
    expect(aviso(podeExceder.planta, 'Sala 2')?.text).toContain('pede justificativa');
    expect(aviso(podeExceder.planta, 'Sala 1')).toBeNull();
  });

  it('soltar numa sala que passa do limite (podendo exceder) abre a justificativa antes de gravar', () => {
    const { fixture, planta, id } = criar({ permitirExcesso: true });
    planta.salaId.set(id('Sala 3'));
    const soltar = () => planta.onOutraSalaDrop(id('Sala 2'), { preventDefault: vi.fn() } as unknown as DragEvent);

    soltar();
    expect(transferir).not.toHaveBeenCalled();
    expect(planta.pedidoJustificativaInfo()).toEqual({
      origemNome: 'Sala 3',
      destinoNome: 'Sala 2',
      depois: 16,
      regra: 'limite de 15 (50% da capacidade de 30)',
    });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#planta-just-titulo')?.textContent).toContain('Justificar o excesso');
    expect(el.querySelector('textarea#planta-justificativa')).not.toBeNull();

    // Sem texto, não transfere; cancelar fecha sem gravar.
    planta.confirmarJustificativa();
    expect(transferir).not.toHaveBeenCalled();
    planta.cancelarJustificativa();
    expect(planta.pedidoJustificativaInfo()).toBeNull();

    // De novo, agora com a justificativa.
    soltar();
    expect(planta.justificativa()).toBe('');
    planta.justificativa.set('Sala 3 vira laboratório');
    planta.confirmarJustificativa();
    expect(transferir).toHaveBeenCalledWith(expect.objectContaining({ quantidade: 1, justificativa: 'Sala 3 vira laboratório' }));
    expect(planta.pedidoJustificativaInfo()).toBeNull();
  });

  it('no modal "Transferir carteiras", passar do limite só segue com a justificativa', () => {
    const { planta, id } = criar({ permitirExcesso: true });
    planta.salaId.set(id('Sala 3'));
    planta.abrirTransferModal();
    planta.onTransferDestinoChange(id('Sala 1'));

    // Sala 1: 12 + 3 = 15 ainda cabe; a 4ª passa do limite e pede justificativa.
    for (let i = 0; i < 2; i++) planta.transferQuantidadeMais();
    expect(planta.transferQuantidade()).toBe(3);
    expect(planta.transferPrecisaJustificativa()).toBe(false);
    expect(planta.podeAvancarTransfer()).toBe(true);

    planta.transferQuantidadeMais();
    expect(planta.transferPrecisaJustificativa()).toBe(true);
    expect(planta.transferAvisoLimite()?.text).toContain('permitem exceder, com justificativa');
    expect(planta.podeAvancarTransfer()).toBe(false);

    planta.justificativa.set('Remanejamento para a prova');
    expect(planta.podeAvancarTransfer()).toBe(true);
    planta.transferAvancar();
    planta.transferConfirmar();
    expect(transferir).toHaveBeenCalledWith(expect.objectContaining({ quantidade: 4, justificativa: 'Remanejamento para a prova' }));
    expect(planta.transferStep()).toBe(3);
  });

  describe('carregando durante a transferência', () => {
    /** A resposta do RM só chega quando o teste mandar. */
    let resposta: Subject<{ sucesso: number }>;
    const texto = (el: HTMLElement, seletor: string) => el.querySelector(seletor)?.textContent?.trim() ?? null;

    function criarComRespostaPendente(regras: Partial<RegrasOcupacao> = {}) {
      const tela = criar(regras);
      resposta = new Subject();
      transferir.mockImplementation(() => resposta);
      tela.planta.salaId.set(tela.id('Sala 3'));
      tela.fixture.detectChanges();
      return { ...tela, el: tela.fixture.nativeElement as HTMLElement };
    }

    it('soltar a carteira cobre a sala, marca a que recebe e trava outro arraste até o RM responder', () => {
      const { fixture, planta, salas, id, el } = criarComRespostaPendente();
      const soltar = () => planta.onOutraSalaDrop(id('Sala 1'), { preventDefault: vi.fn() } as unknown as DragEvent);

      soltar();
      fixture.detectChanges();
      expect(salas.transferindo()).toMatchObject({ destinoNome: 'Sala 1', quantidade: 1, etapa: 'gravando' });
      expect(texto(el, '.saea-carregando-texto')).toBe('Transferindo 1 carteira para Sala 1...');
      expect(texto(el, '.planta-outra-row--recebendo .planta-outra-nome')).toBe('Sala 1');
      expect(texto(el, '.planta-outra-aviso--recebendo')).toBe('Recebendo 1 carteira...');
      expect(el.querySelector('.planta-desk--draggable')).toBeNull();

      // Outra carteira solta no meio do caminho não vira outra gravação.
      soltar();
      expect(transferir).toHaveBeenCalledTimes(1);

      resposta.next({ sucesso: 1 });
      resposta.complete();
      fixture.detectChanges();
      expect(salas.transferindo()).toBeNull();
      expect(el.querySelector('.saea-carregando')).toBeNull();
      expect(el.querySelector('.planta-outra-row--recebendo')).toBeNull();
      expect(el.querySelector('.planta-desk--draggable')).not.toBeNull();
    });

    it('enquanto transfere, os filtros e o turno ficam travados e não trocam a sala; no fim, voltam', async () => {
      const { fixture, planta, salas, id, el } = criarComRespostaPendente();
      const desativados = () =>
        [
          ...el.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('.planta-filters select, .planta-filters .ms-gatilho, .planta-head .planta-tab'),
        ].map((c) => c.disabled);
      // O <select> do app-select aplica o desativado num passo assíncrono do ngModel.
      const atualizar = async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      };

      planta.onOutraSalaDrop(id('Sala 1'), { preventDefault: vi.fn() } as unknown as DragEvent);
      await atualizar();
      expect(planta.filtrosTravados()).toBe(true);
      expect(desativados().length).toBe(7);
      expect(desativados().every(Boolean)).toBe(true);

      // Nada muda pelos métodos também (a troca de sala, de turno, de unidade ou de ano é ignorada).
      planta.onSalaChange(id('Sala 1'));
      planta.selecionarTurno('tarde');
      planta.selecionarUnidades([]);
      planta.onSegmentoChange('Anos Iniciais');
      expect([planta.sala()!.nome, planta.turno(), planta.segmento()]).toEqual(['Sala 3', 'manha', 'todas']);

      resposta.next({ sucesso: 1 });
      resposta.complete();
      await atualizar();
      expect(salas.transferindo()).toBeNull();
      expect(planta.filtrosTravados()).toBe(false);
      expect(desativados().some(Boolean)).toBe(false);
      planta.selecionarTurno('tarde');
      expect(planta.turno()).toBe('tarde');
    });

    it('no modal "Transferir carteiras", o botão fica em "Transferindo..." e só mostra o Concluído no fim', () => {
      const { fixture, planta, el } = criarComRespostaPendente();
      planta.abrirTransferModal();
      planta.transferAvancar();
      planta.transferConfirmar();
      fixture.detectChanges();

      expect(planta.transferStep()).toBe(2);
      const botoes = [...el.querySelectorAll<HTMLButtonElement>('.transfer-foot button')];
      expect(botoes.map((b) => [b.textContent?.trim(), b.disabled])).toEqual([
        ['Voltar', true],
        ['Transferindo...', true],
      ]);

      resposta.next({ sucesso: 1 });
      resposta.complete();
      expect(planta.transferStep()).toBe(3);
    });

    it('com erro, o carregando sai, o modal da justificativa fecha e o arraste volta', () => {
      const { fixture, planta, salas, id, el } = criarComRespostaPendente({ permitirExcesso: true });
      planta.onOutraSalaDrop(id('Sala 2'), { preventDefault: vi.fn() } as unknown as DragEvent);
      planta.justificativa.set('teste');
      planta.confirmarJustificativa();
      fixture.detectChanges();

      expect(texto(el, '.transfer-foot app-button:last-child button')).toBe('Transferindo...');
      // Com a gravação em andamento, cancelar não fecha (espera terminar).
      planta.cancelarJustificativa();
      expect(planta.pedidoJustificativaInfo()).not.toBeNull();

      resposta.error({ error: { message: 'O RM não respondeu.' } });
      fixture.detectChanges();
      expect(salas.transferindo()).toBeNull();
      expect(planta.pedidoJustificativaInfo()).toBeNull();
      expect(el.querySelector('.saea-carregando')).toBeNull();
    });
  });
});

describe('PlantaComponent: carteiras ocupadas só com o ícone, e cabeçalho da sala', () => {
  let getAlunos: ReturnType<typeof vi.fn>;
  let getFotos: ReturnType<typeof vi.fn>;

  // Sala 1 de manhã: o 3º A (2 alunos) e o 3º A Semi-Manhã (1) dividem a sala; 12 carteiras.
  const vinculo: ApiTurmaXSalaDto = {
    ...sala('1', 12),
    UNIDADE: 'CASJ',
    ANOLETIVO: '2026',
    CODTURMA: 'EF3A-M',
    TURMA: '3º Ano A - Manhã',
    TURNO: 'Manhã',
    OCUPACAO: 3,
    COMPOSICAO: 'EF3A-M (2) + EF3A-SM (1)',
  };
  const turma = (codTurma: string, nome: string, ocupacao: number): ApiTurmaDto => ({
    ANOLETIVO: '2026',
    IDPERLET: 222,
    CODFILIAL: 2,
    UNIDADE: 'CASJ',
    SEGMENTO: 'Anos Iniciais',
    CODTURMA: codTurma,
    TURMA: nome,
    TURNO: 'Manhã',
    OCUPACAO: ocupacao,
  });
  const aluno = (ra: string, nome: string, codTurma: string | null): ApiAlunoEnturmacaoDto => ({
    ra,
    nome,
    codFilial: 2,
    segmento: 'Anos Iniciais',
    codCurso: '2',
    codHabilitacao: '3',
    serie: '3º Ano - Ensino Fundamental - Manhã - EF I',
    codTurma,
    turno: 'M',
    novo: false,
    serieAnterior: null,
    turmaAnterior: null,
    dataMatricula: null,
    obs: null,
  });

  function criar() {
    // Fora de ordem; o Davi é do 3º B (outra sala) e a Eva ainda não tem turma.
    getAlunos = vi.fn(() =>
      of([aluno('3', 'Carla Dias', 'EF3A-SM'), aluno('1', 'Ana Lima', 'EF3A-M'), aluno('2', 'Bruno', 'EF3A-M'), aluno('4', 'Davi', 'EF3B-M'), aluno('5', 'Eva', null)]),
    );
    getFotos = vi.fn(() => of({}));
    TestBed.configureTestingModule({
      imports: [PlantaComponent],
      providers: [
        provideRouter([]),
        {
          provide: OcupacaoApiService,
          useValue: {
            getSalasDoAno: () => of([sala('1', 12)]),
            getTurmasXSalas: () => of([vinculo]),
            getTurmas: () => of([turma('EF3A-M', '3º Ano A - Manhã', 2), turma('EF3A-SM', '3º Ano A - Semi-Manhã', 1)]),
            getAnosLetivos: () => of([]),
            // A Planta não mostra mais quem está sentado: nem os alunos nem as fotos são pedidos.
            getAlunosEnturmacao: getAlunos,
            getFotosEnturmacao: getFotos,
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        {
          provide: RegrasService,
          useValue: { regrasDaFilial: () => ({ areaPorAluno: 1.5, pctMaximoUtilizacao: 90, permitirExcesso: false }), carregarFiliais: () => {} },
        },
      ],
    });
    const fixture = TestBed.createComponent(PlantaComponent);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return { fixture, planta: fixture.componentInstance };
  }

  it('a carteira ocupada mostra só o ícone de aluno: sem foto, iniciais nem nome, e os alunos nem são lidos', () => {
    const { fixture, planta } = criar();

    const ocupadas = planta.deskSlots().filter((d) => d.kind === 'aluno');
    expect(ocupadas.map((d) => [d.icon, d.tooltip])).toEqual([
      ['person', 'Carteira ocupada por aluno'],
      ['person', 'Carteira ocupada por aluno'],
      ['person', 'Carteira ocupada por aluno'],
    ]);
    expect(planta.deskSlots()[3]).toMatchObject({ kind: 'vaga', icon: 'event_seat' });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.planta-desk img')).toBeNull();
    expect(el.querySelector('.planta-desk-iniciais')).toBeNull();
    expect([...el.querySelectorAll('.planta-desk--aluno .planta-desk-icon')].map((i) => i.textContent?.trim())).toEqual(['person', 'person', 'person']);
    expect(getAlunos).not.toHaveBeenCalled();
    expect(getFotos).not.toHaveBeenCalled();
  });

  it('à tarde a sala não tem turma: nenhuma carteira ocupada', () => {
    const { fixture, planta } = criar();
    planta.turno.set('tarde');
    fixture.detectChanges();

    expect(planta.deskSlots().some((d) => d.kind === 'aluno')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.planta-desk--aluno')).toBeNull();
  });

  it('o cabeçalho traz o turno, os quatro números e as turmas do turno; a legenda só o que a sala mostra', () => {
    const { fixture, planta } = criar();
    const el = fixture.nativeElement as HTMLElement;

    expect(planta.metaDaSala()).toBe('Sala de aula · 1º andar · 45 m²');
    expect(planta.indicadores().map((k) => [k.rotulo, k.valor, k.sub])).toEqual([
      ['Alunos', '3', 'no turno'],
      ['Carteiras', '12', 'na sala'],
      ['Vagas', '9', 'carteiras livres'],
      ['Limite', '27', '90% de 30'],
    ]);
    // O turno saiu dos filtros e foi para o cabeçalho da sala.
    expect(el.querySelector('.planta-filters .planta-tabs')).toBeNull();
    expect([...el.querySelectorAll('.planta-head .planta-tab')].map((b) => b.textContent?.trim())).toEqual(['Manhã', 'Tarde']);
    expect([...el.querySelectorAll('.planta-turma-chip')].map((c) => c.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      '3º Ano A - Manhã2',
      '3º Ano A - Semi-Manhã1',
    ]);
    expect(planta.legenda().map((l) => l.rotulo)).toEqual(['Aluno sentado', 'Carteira vaga', 'Espaço disponível', 'Bloqueado pela regra']);
    expect(el.querySelector('.planta-frente')?.textContent?.trim()).toBe('Frente da sala · quadro');
  });

  it('a barra de ocupação explica, ao passar o mouse ou focar, o que mede e o que a cor quer dizer', () => {
    const { fixture, planta } = criar();
    const texto =
      'Ocupação das carteiras no turno: 3 alunos em 12 carteiras (25%). A barra fica laranja perto de 90% (limite da regra) e vermelha ao lotar.';

    expect(planta.textoOcupacao()).toBe(texto);
    const alvo = (fixture.nativeElement as HTMLElement).querySelector('.planta-progress-alvo')!;
    expect(alvo.getAttribute('aria-label')).toBe(texto);
    expect(alvo.getAttribute('tabindex')).toBe('0');
    expect(alvo.querySelector('.planta-progress-fill')).not.toBeNull();
  });
});
