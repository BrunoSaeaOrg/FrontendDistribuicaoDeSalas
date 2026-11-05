import { computed, signal, WritableSignal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { REGRAS_PADRAO, RegrasOcupacao, Unidade } from '../../core/models';
import { obsDosPadroes, RegrasService } from '../../core/services/regras.service';
import { SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { RegrasComponent } from './regras.component';

const UNIDADES: Unidade[] = [
  { id: '2', nome: 'CASJ 1', cor: '#2e9cb5', codFilial: 2 },
  { id: '13', nome: 'CASJ 2', cor: '#1f325b', codFilial: 13 },
];

describe('RegrasComponent: a Unidade é obrigatória', () => {
  let fixture: ComponentFixture<RegrasComponent>;
  let carregar: ReturnType<typeof vi.fn>;
  let restaurarPadroes: ReturnType<typeof vi.fn>;
  let confirmar: ReturnType<typeof vi.fn>;
  let salvando: WritableSignal<boolean>;
  const editor = signal(true);
  const el = () => fixture.nativeElement as HTMLElement;
  const tela = () => fixture.componentInstance;
  /** O <input> nativo de cada app-input, pelo começo do rótulo. */
  const campo = (rotulo: string) =>
    [...el().querySelectorAll('app-input')]
      .find((c) => c.querySelector('label')?.textContent?.trim().startsWith(rotulo))!
      .querySelector('input')!;
  const camposDesativados = () => ['Área por pessoa', '% máximo', 'Observações'].map((r) => campo(r).disabled);
  const switchDesativado = () => !!el().querySelector('.saea-switch--disabled');
  const botoes = () => [...el().querySelectorAll<HTMLButtonElement>('app-button button')];
  const botao = (texto: string) => botoes().find((b) => b.textContent?.includes(texto))!;

  /** O ngModel do input liga e desliga o campo no tique seguinte. */
  const atualizar = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    carregar = vi.fn();
    editor.set(true);
    // Sem "Permitir exceder": a observação não é obrigatória e o Salvar depende só da unidade.
    const regras = signal<RegrasOcupacao>({ ...REGRAS_PADRAO, permitirExcesso: false });
    const obs = signal('');
    salvando = signal(false);
    restaurarPadroes = vi.fn(() => salvando.set(true));
    confirmar = vi.fn(async () => true);
    TestBed.configureTestingModule({
      imports: [RegrasComponent],
      providers: [
        {
          provide: RegrasService,
          useValue: {
            regras,
            obs,
            carregando: signal(false),
            salvando,
            faltaObs: computed(() => regras().permitirExcesso && !obs().trim()),
            regrasDaFilial: () => ({ ...REGRAS_PADRAO }),
            restaurarPadroes,
            carregar,
            salvar: vi.fn(),
          },
        },
        {
          provide: SalasService,
          useValue: { unidades: signal(UNIDADES), salasDaUnidade: () => [], trocandoAno: signal(false) },
        },
        { provide: UiModeService, useValue: { editorMode: editor, readOnlyMode: computed(() => !editor()) } },
        { provide: ToastService, useValue: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), danger: vi.fn() } },
        { provide: ConfirmDialogService, useValue: { confirm: confirmar } },
      ],
    });
    fixture = TestBed.createComponent(RegrasComponent);
    await atualizar();
  });

  it('abre sem unidade: campo com "*", os outros campos e os botões desativados', () => {
    const rotulo = el().querySelector('app-multi-select label')!;
    expect(rotulo.querySelector('.ms-obrigatorio')?.textContent).toBe('*');
    expect(rotulo.textContent).toContain('(obrigatório)');
    expect(el().querySelector('app-multi-select .ms-gatilho')!.textContent).toContain('Selecione a unidade...');
    expect(el().textContent).toContain('Selecione a unidade para ver e alterar as regras dela.');

    expect(camposDesativados()).toEqual([true, true, true]);
    expect(switchDesativado()).toBe(true);
    expect(botao('Salvar regras').disabled).toBe(true);
    expect(botao('Restaurar padrões').disabled).toBe(true);
    expect(carregar).not.toHaveBeenCalled();
  });

  it('marcar uma unidade carrega as regras dela e liga os campos; desmarcar desliga de novo', async () => {
    tela().filiais.set(['13']);
    await atualizar();

    expect(carregar).toHaveBeenCalledWith(13);
    expect(camposDesativados()).toEqual([false, false, false]);
    expect(switchDesativado()).toBe(false);
    expect(botao('Salvar regras').disabled).toBe(false);
    expect(botao('Restaurar padrões').disabled).toBe(false);

    tela().filiais.set([]);
    await atualizar();
    expect(camposDesativados()).toEqual([true, true, true]);
    expect(botao('Salvar regras').disabled).toBe(true);
  });

  it('só leitura: escolhe a unidade para ver as regras, mas os campos seguem desativados', async () => {
    editor.set(false);
    await atualizar();
    expect(el().querySelector<HTMLButtonElement>('app-multi-select .ms-gatilho')!.disabled).toBe(false);

    tela().filiais.set(['2']);
    await atualizar();
    expect(carregar).toHaveBeenCalledWith(2);
    expect(camposDesativados()).toEqual([true, true, true]);
    expect(switchDesativado()).toBe(true);
    expect(el().querySelector('.regras-actions')).toBeNull();
  });

  it('"Restaurar padrões" confirma em quais unidades e com que valores, e grava em todas as marcadas', async () => {
    tela().filiais.set(['2', '13']);
    await atualizar();

    await tela().restaurarPadroes();
    expect(confirmar).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Restaurar os padrões?',
        description:
          'As regras de CASJ 1 e CASJ 2 passam a ser os padrões do sistema: 1,5 m² por pessoa, 90% de utilização e pode exceder, ' +
          `com a observação "${obsDosPadroes()}". Isso grava no RM agora, uma unidade por vez.`,
        confirmLabel: 'Restaurar e gravar',
      }),
    );
    expect(restaurarPadroes).toHaveBeenCalledWith([
      { codFilial: 2, nome: 'CASJ 1' },
      { codFilial: 13, nome: 'CASJ 2' },
    ]);

    // Gravando: o botão dele fica em "Restaurando..." (o Salvar não diz "Salvando...").
    await atualizar();
    expect(botoes().map((b) => b.textContent?.trim())).toEqual(['Salvar regras', 'Restaurando...']);
    salvando.set(false);
    await atualizar();
    expect(botoes().map((b) => b.textContent?.trim())).toEqual(['Salvar regras', 'Restaurar padrões']);
  });

  it('desistir na confirmação não grava nada', async () => {
    tela().filiais.set(['13']);
    await atualizar();
    confirmar.mockImplementation(async () => false);

    await tela().restaurarPadroes();
    expect(restaurarPadroes).not.toHaveBeenCalled();
  });
});

describe('RegrasComponent com o RegrasService de verdade: restaurar com todas as unidades marcadas', () => {
  it('grava os padrões em cada unidade, uma de cada vez, e os campos mostram os padrões', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RegrasComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SalasService, useValue: { unidades: signal(UNIDADES), salasDaUnidade: () => [], trocandoAno: signal(false) } },
        { provide: ConfirmDialogService, useValue: { confirm: async () => true } },
        { provide: ToastService, useValue: { info: vi.fn(), success: vi.fn(), warning: vi.fn(), danger: vi.fn() } },
      ],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(RegrasComponent);
    const el = fixture.nativeElement as HTMLElement;
    const atualizar = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const pct = () =>
      [...el.querySelectorAll('app-input')]
        .find((c) => c.querySelector('label')?.textContent?.includes('% máximo'))!
        .querySelector('input')!;
    const salvarReq = () => http.expectOne((r) => r.url.endsWith('/OC_SAL_REGRAS_SALVAR'));
    await atualizar();

    // "Todas as unidades": o formulário carrega a regra da primeira (CASJ 1 = filial 2).
    fixture.componentInstance.filiais.set(['2', '13']);
    await atualizar();
    http
      .expectOne((r) => r.url.endsWith('/OC_SAL_REGRAS'))
      .flush([{ CODFILIAL: 2, AREAPORPESSOA: 1.5, PERCMAXUTIL: 50, PERMEXCEDER: 2, OBS: '' }]);
    await atualizar();
    expect(pct().value).toBe('50');

    await fixture.componentInstance.restaurarPadroes();
    await atualizar();
    expect(pct().value).toBe('90');

    const primeira = salvarReq();
    expect(primeira.request.body).toMatchObject({ CODFILIAL: '2', PERCMAXUTIL: '90', PERMEXCEDER: '1' });
    primeira.flush({ CODFILIAL: 2, AREAPORPESSOA: 1.5, PERCMAXUTIL: 90, PERMEXCEDER: 1 });
    const segunda = salvarReq();
    expect(segunda.request.body).toMatchObject({ CODFILIAL: '13', PERCMAXUTIL: '90', PERMEXCEDER: '1' });
    segunda.flush({ CODFILIAL: 13, AREAPORPESSOA: 1.5, PERCMAXUTIL: 90, PERMEXCEDER: 1 });
    http.verify();
  });
});
