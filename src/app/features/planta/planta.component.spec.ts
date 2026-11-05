import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { RegrasOcupacao } from '../../core/models';
import { ApiSalaDoAnoDto } from '../../core/models/ocupacao-api.model';
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
