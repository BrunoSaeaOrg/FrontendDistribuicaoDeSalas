import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { REGRAS_PADRAO } from '../models';
import { obsDosPadroes, RegrasService } from './regras.service';
import { ToastService } from './toast.service';

let regras: RegrasService;
let http: HttpTestingController;
let toast: { success: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

beforeEach(() => {
  toast = { success: vi.fn(), danger: vi.fn(), warning: vi.fn() };
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), { provide: ToastService, useValue: toast }],
  });
  regras = TestBed.inject(RegrasService);
  http = TestBed.inject(HttpTestingController);
});

afterEach(() => http.verify());

const salvarReq = () => http.expectOne((r) => r.url.endsWith('/OC_SAL_REGRAS_SALVAR'));
const regrasReqs = () => http.match((r) => r.url.endsWith('/OC_SAL_REGRAS'));

const CASJ1 = { codFilial: 2, nome: 'CASJ 1' };
const CASJ2 = { codFilial: 13, nome: 'CASJ 2' };
const LICEU = { codFilial: 6, nome: 'Liceu' };

describe('RegrasService.salvar', () => {
  it('manda a área com ponto e dá sucesso com o registro que o back devolve (sem CodRetorno)', () => {
    regras.setAreaPorAluno(1.5);
    regras.setPctMaximoUtilizacao(20);
    regras.setPermitirExcesso(false);

    regras.salvar([CASJ1]);
    const req = salvarReq();
    expect(req.request.body).toMatchObject({
      CODFILIAL: '2',
      AREAPORPESSOA: '1.5',
      PERCMAXUTIL: '20',
      PERMEXCEDER: '2',
    });
    // Resposta real do back em 2026-11-04: o registro como ficou no RM.
    req.flush({ id: '1|2', CODCOLIGADA: 1, CODFILIAL: 2, AREAPORPESSOA: 1.5, PERCMAXUTIL: 20, PERMEXCEDER: 2 });

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.danger).not.toHaveBeenCalled();
    expect(regras.salvando()).toBe(false);
  });

  it('mostra na tela o que o RM gravou de fato', () => {
    regras.setAreaPorAluno(1.5);
    regras.setObs('motivo');

    regras.salvar([CASJ1]);
    salvarReq().flush({ id: '1|2', AREAPORPESSOA: 15, PERCMAXUTIL: 20, PERMEXCEDER: 1 });

    expect(regras.regras()).toEqual({ areaPorAluno: 15, pctMaximoUtilizacao: 20, permitirExcesso: true });
  });

  it('erro HTTP vira falha', () => {
    regras.setPermitirExcesso(false);
    regras.salvar([CASJ1]);
    salvarReq().flush({ message: 'x' }, { status: 400, statusText: 'Bad Request' });

    expect(toast.danger).toHaveBeenCalledWith('Falha ao salvar regras', 'O RM não gravou as regras. Tente de novo.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(regras.salvando()).toBe(false);
  });

  it('com "Permitir exceder" ligado, a observação é obrigatória', () => {
    regras.setPermitirExcesso(true);
    regras.setObs('   ');
    expect(regras.faltaObs()).toBe(true);

    regras.salvar([CASJ1]);
    http.expectNone((r) => r.url.endsWith('/OC_SAL_REGRAS_SALVAR'));
    expect(toast.warning).toHaveBeenCalledTimes(1);

    regras.setObs('Turmas grandes no 3º ano');
    expect(regras.faltaObs()).toBe(false);
    regras.salvar([CASJ1]);
    expect(salvarReq().request.body).toMatchObject({ PERMEXCEDER: '1', OBS: 'Turmas grandes no 3º ano' });
  });

  it('sem "Permitir exceder" a observação continua opcional', () => {
    regras.setPermitirExcesso(false);
    expect(regras.faltaObs()).toBe(false);
  });

  it('o que foi salvo passa a valer na hora para a filial', () => {
    regras.setPctMaximoUtilizacao(50);
    regras.setPermitirExcesso(false);
    regras.salvar([CASJ1]);
    salvarReq().flush({ id: '1|2', AREAPORPESSOA: 1.5, PERCMAXUTIL: 50, PERMEXCEDER: 2 });

    expect(regras.regrasDaFilial(2)).toEqual({ areaPorAluno: 1.5, pctMaximoUtilizacao: 50, permitirExcesso: false });
    expect(regras.regrasDaFilial(13)).toEqual(REGRAS_PADRAO);
  });

  it('várias unidades marcadas: grava uma de cada vez, todas com as mesmas regras', () => {
    regras.setPctMaximoUtilizacao(60);
    regras.setPermitirExcesso(false);
    regras.salvar([CASJ1, CASJ2, LICEU]);

    // Só a primeira vai ao RM; a próxima espera a resposta (sem rajada).
    for (const filial of [2, 13, 6]) {
      const req = salvarReq();
      expect(req.request.body).toMatchObject({ CODFILIAL: String(filial), PERCMAXUTIL: '60' });
      expect(regras.salvando()).toBe(true);
      req.flush({ CODFILIAL: filial, AREAPORPESSOA: 1.5, PERCMAXUTIL: 60, PERMEXCEDER: 2 });
    }

    expect(regras.salvando()).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('Regras salvas', 'Aplicadas em CASJ 1, CASJ 2 e Liceu.');
    for (const filial of [2, 13, 6]) expect(regras.regrasDaFilial(filial).pctMaximoUtilizacao).toBe(60);
  });

  it('uma unidade que falha não impede as outras, e o aviso diz qual faltou', () => {
    regras.setPermitirExcesso(false);
    regras.salvar([CASJ1, CASJ2]);

    salvarReq().flush({ message: 'x' }, { status: 400, statusText: 'Bad Request' });
    salvarReq().flush({ CODFILIAL: 13, AREAPORPESSOA: 1.5, PERCMAXUTIL: 90, PERMEXCEDER: 2 });

    expect(toast.warning).toHaveBeenCalledWith(
      'Regras salvas em parte',
      'Aplicadas em CASJ 2. O RM não gravou em CASJ 1: tente de novo.',
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(regras.regrasDaFilial(2)).toEqual(REGRAS_PADRAO);
    expect(regras.salvando()).toBe(false);
  });

  it('sem unidade marcada, não grava nada', () => {
    regras.salvar([]);
    http.expectNone((r) => r.url.endsWith('/OC_SAL_REGRAS_SALVAR'));
    expect(regras.salvando()).toBe(false);
  });
});

describe('RegrasService.carregarFiliais', () => {
  const responder = (req: TestRequest, linhas: unknown[]) => req.flush(linhas);

  it('lê uma filial de cada vez, uma vez só, e filial sem registro fica com os padrões', () => {
    regras.carregarFiliais([2, 13, 2]);

    // Só a primeira vai ao RM; a próxima espera a resposta (sem rajada).
    let pendentes = regrasReqs();
    expect(pendentes.map((r) => r.request.body)).toEqual([{ CODFILIAL: '2' }]);
    responder(pendentes[0], [{ CODFILIAL: 2, AREAPORPESSOA: 1.5, PERCMAXUTIL: 50, PERMEXCEDER: 2, OBS: 'x' }]);

    pendentes = regrasReqs();
    expect(pendentes.map((r) => r.request.body)).toEqual([{ CODFILIAL: '13' }]);
    responder(pendentes[0], []);

    expect(regras.regrasDaFilial(2)).toEqual({ areaPorAluno: 1.5, pctMaximoUtilizacao: 50, permitirExcesso: false });
    expect(regras.regrasDaFilial(13)).toEqual(REGRAS_PADRAO);

    // De novo (troca de ano): nada vai ao RM.
    regras.carregarFiliais([2, 13]);
    expect(regrasReqs()).toHaveLength(0);
  });

  it('ignora linha de outra filial (se a consulta não filtrar)', () => {
    regras.carregarFiliais([6]);
    responder(regrasReqs()[0], [{ CODFILIAL: 2, AREAPORPESSOA: 1.5, PERCMAXUTIL: 50, PERMEXCEDER: 2 }]);

    expect(regras.regrasDaFilial(6)).toEqual(REGRAS_PADRAO);
  });

  it('se o RM falhar, tenta de novo na próxima carga', () => {
    regras.carregarFiliais([2]);
    regrasReqs()[0].flush('erro', { status: 500, statusText: 'Erro' });
    expect(regras.regrasDaFilial(2)).toEqual(REGRAS_PADRAO);

    regras.carregarFiliais([2]);
    const denovo = regrasReqs(); // o match tira os pedidos da lista: guarda para responder
    expect(denovo).toHaveLength(1);
    denovo[0].flush([]);
  });
});

describe('RegrasService.restaurarPadroes', () => {
  it('põe os padrões do sistema e grava em cada unidade marcada, uma de cada vez', () => {
    // O formulário estava com outra regra (a da CASJ 1).
    regras.setPctMaximoUtilizacao(50);
    regras.setPermitirExcesso(false);

    regras.restaurarPadroes([CASJ1, CASJ2]);
    expect(regras.regras()).toEqual(REGRAS_PADRAO);
    expect(regras.obs()).toBe(obsDosPadroes());

    // Uma por vez: a segunda só sai depois da primeira responder.
    const primeira = salvarReq();
    expect(primeira.request.body).toMatchObject({
      CODFILIAL: '2',
      AREAPORPESSOA: '1.5',
      PERCMAXUTIL: '90',
      PERMEXCEDER: '1',
      OBS: obsDosPadroes(),
    });
    primeira.flush({ CODFILIAL: 2, AREAPORPESSOA: 1.5, PERCMAXUTIL: 90, PERMEXCEDER: 1 });
    const segunda = salvarReq();
    expect(segunda.request.body).toMatchObject({ CODFILIAL: '13', PERCMAXUTIL: '90', PERMEXCEDER: '1' });
    segunda.flush({ CODFILIAL: 13, AREAPORPESSOA: 1.5, PERCMAXUTIL: 90, PERMEXCEDER: 1 });

    expect(toast.success).toHaveBeenCalledWith('Padrões restaurados', 'Aplicadas em CASJ 1 e CASJ 2.');
    // As outras telas passam a usar os padrões nessas unidades.
    expect(regras.regrasDaFilial(2)).toEqual(REGRAS_PADRAO);
    expect(regras.regrasDaFilial(13)).toEqual(REGRAS_PADRAO);
  });

  it('a observação dos padrões diz a data', () => {
    expect(obsDosPadroes(new Date(2026, 10, 5))).toBe('Padrões do sistema restaurados em 05/11/2026.');
  });

  it('sem unidade marcada, ou já gravando, não faz nada', () => {
    regras.restaurarPadroes([]);
    regras.setPermitirExcesso(false);
    regras.salvar([CASJ1]);
    regras.restaurarPadroes([CASJ2]);
    // Só a gravação do Salvar saiu.
    expect(salvarReq().request.body).toMatchObject({ CODFILIAL: '2' });
  });
});
