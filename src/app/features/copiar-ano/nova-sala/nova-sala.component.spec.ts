import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiSalaCriadaDto, ApiSalaNovaOpcoesDto, ApiSalaNovaUnidadeDto } from '../../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../../core/services/ocupacao-api.service';
import { RegrasService } from '../../../core/services/regras.service';
import { SalasService } from '../../../core/services/salas.service';
import { ToastService } from '../../../core/services/toast.service';
import { capacidadePelaArea, lerNumero, NovaSalaComponent, sugerirCodigo } from './nova-sala.component';

const unidade = (codFilial: number, nome: string, codigos: string[], anos = ['2026', '2027']): ApiSalaNovaUnidadeDto => ({
  codFilial,
  unidade: nome,
  anos,
  locais: [{ codPredio: '1', predio: nome, codBloco: '1', bloco: 'Bloco I' }],
  salas: codigos.map((c) => ({ codPredio: '1', codBloco: '1', codSala: c, sala: `SALA ${c}` })),
});

const OPCOES: ApiSalaNovaOpcoesDto = {
  unidades: [unidade(13, 'CASJ - UNIDADE II', ['101', 'LAB01', '406']), unidade(2, 'CASJ - UNIDADE I', ['1', '12A', '44'])],
  // O backend só manda os tipos do pedagógico (os que as telas mostram).
  tipos: [
    { codTipoSala: 2, nome: 'Sala de Aula' },
    { codTipoSala: 3, nome: 'Pedagógico' },
  ],
};

describe('sugestões da sala nova', () => {
  it('o código é o número depois do maior (só os códigos com números contam)', () => {
    expect(sugerirCodigo([{ codSala: '1' }, { codSala: '12A' }, { codSala: '44' }])).toBe('45');
    expect(sugerirCodigo([{ codSala: 'COR' }, { codSala: 'PAS' }])).toBe('');
    expect(sugerirCodigo([])).toBe('');
  });

  it('lê área com vírgula ou ponto, e o que não é número vira NaN', () => {
    expect(lerNumero('48,5')).toBe(48.5);
    expect(lerNumero(' 66.68 ')).toBe(66.68);
    expect(lerNumero('')).toBeNull();
    expect(lerNumero('4a')).toBeNaN();
  });

  it('a capacidade pela área arredonda como as salas do RM (48,95 m² ÷ 1,5 → 33)', () => {
    expect(capacidadePelaArea(48.95, 1.5)).toBe(33);
    expect(capacidadePelaArea(66.68, 1.5)).toBe(44);
    expect(capacidadePelaArea(null, 1.5)).toBeNull();
    expect(capacidadePelaArea(NaN, 1.5)).toBeNull();
  });
});

describe('NovaSalaComponent (Salas por ano → Nova sala)', () => {
  let api: { getOpcoesSalaNova: ReturnType<typeof vi.fn>; criarSala: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };
  let carregarFiliais: ReturnType<typeof vi.fn>;

  async function abrir(opcoes = OPCOES): Promise<ComponentFixture<NovaSalaComponent>> {
    api.getOpcoesSalaNova.mockReturnValue(of(opcoes));
    const fixture = TestBed.createComponent(NovaSalaComponent);
    fixture.componentRef.setInput('anoSugerido', '2027');
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const texto = () => document.body.textContent ?? '';
  const botao = (rotulo: string) =>
    [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(rotulo)) as HTMLButtonElement | undefined;

  beforeEach(() => {
    api = {
      getOpcoesSalaNova: vi.fn(),
      criarSala: vi.fn(() =>
        of<ApiSalaCriadaDto>({ codFilial: 2, codSala: '45', sala: 'SALA 45', anos: [{ ano: '2027', idPerlet: 236, situacao: 'incluida', erro: null }] }),
      ),
    };
    toast = { success: vi.fn(), warning: vi.fn() };
    carregarFiliais = vi.fn();
    TestBed.configureTestingModule({
      imports: [NovaSalaComponent],
      providers: [
        { provide: OcupacaoApiService, useValue: api },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        {
          provide: RegrasService,
          useValue: { regrasDaFilial: () => ({ areaPorAluno: 1.5, pctMaximoUtilizacao: 90, permitirExcesso: true }), carregarFiliais },
        },
        // Como nas outras telas: o RM chama as três filiais da CASJ de "CASJ" (UNIDADE).
        { provide: SalasService, useValue: { filiais: signal(new Map([[2, 'CASJ'], [13, 'CASJ']])) } },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  afterEach(() => {
    // O véu e o painel do diálogo vão para o body: limpa entre os testes.
    TestBed.resetTestingModule();
  });

  it('ao abrir, lê o RM e pede para escolher a unidade, na ordem do nome das telas', async () => {
    const fixture = await abrir();
    const tela = fixture.componentInstance;

    expect(api.getOpcoesSalaNova).toHaveBeenCalledExactlyOnceWith('bruno');
    expect(tela.unidades().map((u) => `${u.nome} (${u.salas})`)).toEqual(['CASJ 1 (3)', 'CASJ 2 (3)']);
    expect(texto()).toContain('Em qual unidade a sala vai ficar?');
    expect(api.criarSala).not.toHaveBeenCalled();
  });

  it('escolher a unidade já sugere código, nome, tipo e o ano da tela; a capacidade sai da área', async () => {
    const fixture = await abrir();
    const tela = fixture.componentInstance;

    tela.escolherUnidade(2);
    fixture.detectChanges();

    expect([tela.codigo(), tela.nome(), tela.tipo(), [...tela.anos()]]).toEqual(['45', 'SALA 45', '2', ['2027']]);
    expect(carregarFiliais).toHaveBeenCalledWith([2]);
    expect(tela.titulo()).toBe('Nova sala na CASJ 1');

    tela.area.set('48,95');
    expect([tela.capacidade(), tela.carteiras()]).toEqual(['33', '33']);
    // O que a pessoa digita vale mais que a sugestão.
    tela.digitarCarteiras('30');
    tela.area.set('66,68');
    expect([tela.capacidade(), tela.carteiras()]).toEqual(['44', '30']);
  });

  it('código que a unidade já tem aparece na hora e não deixa criar', async () => {
    const fixture = await abrir();
    const tela = fixture.componentInstance;
    tela.escolherUnidade(2);
    tela.codigo.set('12a');
    fixture.detectChanges();

    expect(tela.erroDe('codigo')).toBe('Já existe: SALA 12A usa esse código.');
    await tela.criar();
    expect(api.criarSala).not.toHaveBeenCalled();
  });

  it('os outros erros só aparecem depois do primeiro Criar', async () => {
    const fixture = await abrir();
    const tela = fixture.componentInstance;
    tela.escolherUnidade(2);
    fixture.detectChanges();

    expect(tela.erroDe('andar')).toBeNull();
    await tela.criar();
    fixture.detectChanges();

    expect([tela.erroDe('andar'), tela.erroDe('capacidade')]).toEqual(['Escolha o andar.', 'De 1 a 500 lugares.']);
    expect(api.criarSala).not.toHaveBeenCalled();
  });

  it('Criar sala manda a sala, avisa, fecha e conta para a tela', async () => {
    const fixture = await abrir();
    const tela = fixture.componentInstance;
    const criadas: ApiSalaCriadaDto[] = [];
    tela.criada.subscribe((c) => criadas.push(c));
    tela.escolherUnidade(2);
    tela.andar.set('1');
    tela.area.set('48,5');
    tela.marcarAno('2026', true);
    fixture.detectChanges();

    botao('Criar sala')!.click();
    await fixture.whenStable();

    expect(api.criarSala).toHaveBeenCalledExactlyOnceWith('bruno', {
      codFilial: 2,
      codPredio: '1',
      codBloco: '1',
      codSala: '45',
      descricao: 'SALA 45',
      codTipoSala: 2,
      andar: '1',
      area: 48.5,
      capacidade: 32,
      carteiras: 32,
      anos: ['2026', '2027'],
    });
    expect(toast.success).toHaveBeenCalledWith('Sala criada', 'SALA 45 na CASJ 1, em 2027.');
    expect(criadas).toHaveLength(1);
    expect(tela.open()).toBe(false);
  });

  it('ano que não entrou vira aviso, com o motivo', async () => {
    api.criarSala.mockReturnValue(
      of<ApiSalaCriadaDto>({
        codFilial: 2,
        codSala: '45',
        sala: 'SALA 45',
        anos: [
          { ano: '2026', idPerlet: null, situacao: 'falhou', erro: 'A unidade tem mais de um período letivo em 2026.' },
          { ano: '2027', idPerlet: 236, situacao: 'incluida', erro: null },
        ],
      }),
    );
    const fixture = await abrir();
    const tela = fixture.componentInstance;
    tela.escolherUnidade(2);
    tela.andar.set('T');
    tela.digitarCapacidade('30');

    await tela.criar();

    expect(toast.warning).toHaveBeenCalledWith(
      'Sala criada, mas fora de 2026',
      'SALA 45 na CASJ 1 está no cadastro do RM e em 2027. Não entrou em 2026: A unidade tem mais de um período letivo em 2026.',
    );
  });

  it('o RM recusou: nada foi criado, o formulário fica aberto com o motivo', async () => {
    api.criarSala.mockReturnValue(throwError(() => ({ status: 400, error: { message: 'A CASJ - UNIDADE I já tem a sala de código 45 (SALA 45).' } })));
    const fixture = await abrir();
    const tela = fixture.componentInstance;
    tela.escolherUnidade(2);
    tela.andar.set('T');
    tela.digitarCapacidade('30');

    await tela.criar();
    fixture.detectChanges();

    expect(tela.open()).toBe(true);
    expect(tela.erroDoRm()).toContain('já tem a sala de código 45');
    expect(texto()).toContain('A sala não foi criada');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('com uma unidade só, já abre no formulário', async () => {
    const fixture = await abrir({ ...OPCOES, unidades: [OPCOES.unidades[1]] });

    expect(fixture.componentInstance.codFilial()).toBe(2);
    expect(texto()).toContain('Entra nos anos letivos');
  });
});
