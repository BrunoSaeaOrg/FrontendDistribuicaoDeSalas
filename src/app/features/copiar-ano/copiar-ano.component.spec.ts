import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import {
  ApiCopiaAnoPlanoDto,
  ApiCopiaSalaDto,
  ApiCopiaTurmaDto,
  ApiSituacaoCopiaAno,
} from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { CopiarAnoComponent, SALAS_POR_LOTE } from './copiar-ano.component';

const sala = (n: number, situacao: ApiSituacaoCopiaAno = 'copiar', codFilial = 2): ApiCopiaSalaDto => ({
  id: `1|${codFilial}|100|1|1|1|${n}`,
  codFilial,
  unidade: 'CASJ',
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

/** Com "liberar", a sala vai vazia (sai da sala); com "mover", ela está noutra sala no destino. */
const turma = (codTurma: string, situacao: ApiSituacaoCopiaAno = 'vincular'): ApiCopiaTurmaDto => {
  const semSala = situacao === 'liberar';
  return {
    codFilial: 2,
    unidade: 'CASJ',
    codTurma,
    turma: `${codTurma} - Manhã`,
    sala: semSala ? '' : 'Sala 1',
    codBloco: semSala ? '' : '1',
    codPredio: semSala ? '' : '1',
    codSala: semSala ? '' : '1',
    salaNoDestino: situacao === 'mover' || semSala ? 'Sala 12' : '',
    idPerletDestino: ['vincular', 'mover', 'liberar'].includes(situacao) ? 300 : null,
    situacao,
  };
};

const plano = (salas: ApiCopiaSalaDto[], turmas: ApiCopiaTurmaDto[] = [], periodosDoRm = true): ApiCopiaAnoPlanoDto => ({
  salas,
  turmas,
  periodosDoRm,
});

describe('CopiarAnoComponent', () => {
  const anoLetivo = signal('2026');
  const somenteLeitura = signal(false);
  let api: {
    getPlanoCopiaAno: ReturnType<typeof vi.fn>;
    copiarSalasDoAno: ReturnType<typeof vi.fn>;
    salvarTurmaXSala: ReturnType<typeof vi.fn>;
  };
  let confirm: ReturnType<typeof vi.fn>;
  let carregar: ReturnType<typeof vi.fn>;

  function criar(p?: ApiCopiaAnoPlanoDto): CopiarAnoComponent {
    if (p) api.getPlanoCopiaAno.mockReturnValue(of(p));
    const fixture = TestBed.createComponent(CopiarAnoComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

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
    confirm = vi.fn().mockResolvedValue(true);
    carregar = vi.fn();
    TestBed.configureTestingModule({
      imports: [CopiarAnoComponent],
      providers: [
        { provide: OcupacaoApiService, useValue: api },
        { provide: SalasService, useValue: { anoLetivo, anosLetivos: signal(['2025', '2026', '2027']), carregar } },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'bruno' }) } },
        { provide: ConfirmDialogService, useValue: { confirm } },
        { provide: UiModeService, useValue: { readOnlyMode: somenteLeitura } },
      ],
    });
  });

  it('começa no ano da tela e no seguinte, se o seguinte existir no RM', () => {
    const tela = criar();
    expect([tela.anoOrigem(), tela.anoDestino()]).toEqual(['2026', '2027']);

    anoLetivo.set('2027');
    expect([tela.anoOrigem(), tela.anoDestino()]).toEqual(['2027', '']);
  });

  it(`um clique copia tudo: as salas em lotes de ${SALAS_POR_LOTE} e depois as turmas no período do destino`, async () => {
    const tela = criar(
      plano(
        [...Array.from({ length: 23 }, (_, i) => sala(i + 1)), sala(99, 'ja-existe')],
        [turma('EF3A-M'), turma('EF3B-M'), turma('EF3C-M', 'ja-vinculada')],
      ),
    );

    await tela.copiar();

    expect(api.getPlanoCopiaAno).toHaveBeenCalledWith('bruno', '2026', '2027');
    expect(api.copiarSalasDoAno.mock.calls.map((c) => (c[3] as string[]).length)).toEqual([10, 10, 3]);
    expect(api.copiarSalasDoAno.mock.calls[0].slice(0, 3)).toEqual(['bruno', '2026', '2027']);
    expect(api.salvarTurmaXSala).toHaveBeenCalledTimes(2);
    expect(api.salvarTurmaXSala).toHaveBeenCalledWith({
      codFilial: 2,
      codTurma: 'EF3A-M',
      idPerlet: 300,
      codBloco: '1',
      codPredio: '1',
      codSala: '1',
    });
    expect(tela.contarSalas()('criada')).toBe(23);
    expect(tela.contarTurmas()('vinculada')).toBe(2);
    expect(tela.copiada()).toBe(true);
    expect(tela.copiando()).toBe(false);
    // A tela está em 2026, não no ano que recebeu a cópia.
    expect(carregar).not.toHaveBeenCalled();
  });

  it('o resumo do resultado só traz o que não é zero', async () => {
    const tela = criar(
      plano([sala(1), sala(2, 'ja-existe'), sala(3, 'sem-periodo')], [turma('EF3A-M'), turma('EF3B-M', 'sem-turma')]),
    );

    await tela.copiar();

    expect(tela.resumoSalas().map((r) => `${r.quantidade} ${r.texto}`)).toEqual([
      '1 copiadas',
      '1 já iguais no destino',
      '1 ficaram de fora',
    ]);
    expect(tela.resumoTurmas().map((r) => `${r.quantidade} ${r.texto}`)).toEqual([
      '1 colocadas nas salas',
      '1 ficaram de fora',
    ]);
    expect(tela.deFora().turmasSemDestino).toBe(1);
  });

  it('diz quais filiais ficaram sem período, mesmo com o nome de unidade repetido', async () => {
    const tela = criar(plano([sala(1), sala(2, 'sem-periodo', 16), sala(3, 'sem-periodo', 13), sala(4, 'sem-periodo', 16)]));

    await tela.copiar();

    expect(tela.deFora().semPeriodo).toEqual(['CASJ (filial 13)', 'CASJ (filial 16)']);
  });

  it('um lote que falha marca as salas dele e a cópia segue com o resto', async () => {
    const toast = TestBed.inject(ToastService);
    const aviso = vi.spyOn(toast, 'warning');
    const tela = criar(plano(Array.from({ length: 12 }, (_, i) => sala(i + 1)), [turma('EF3A-M'), turma('EF3B-M')]));
    api.copiarSalasDoAno.mockReturnValueOnce(throwError(() => ({ error: { message: 'RM fora do ar' } })));
    api.salvarTurmaXSala.mockReturnValueOnce(throwError(() => ({ error: { message: 'O RM não gravou o vínculo' } })));

    await tela.copiar();

    expect(tela.contarSalas()('falhou')).toBe(10);
    expect(tela.contarSalas()('criada')).toBe(2);
    expect(tela.salas()[0].erro).toBe('RM fora do ar');
    expect(tela.contarTurmas()('falhou')).toBe(1);
    expect(tela.contarTurmas()('vinculada')).toBe(1);
    expect(aviso).toHaveBeenCalled();
  });

  it('se o RM não responde ao plano, avisa e não grava nada', async () => {
    const toast = TestBed.inject(ToastService);
    const erro = vi.spyOn(toast, 'danger');
    const tela = criar();
    api.getPlanoCopiaAno.mockReturnValue(throwError(() => ({ error: { message: 'RM fora do ar' } })));

    await tela.copiar();

    expect(erro).toHaveBeenCalledWith('Não foi possível copiar', 'RM fora do ar');
    expect(api.copiarSalasDoAno).not.toHaveBeenCalled();
    expect(tela.copiando()).toBe(false);
    expect(tela.copiada()).toBe(false);
  });

  it('sem confirmar, não grava nada e o plano fica na tela para consulta', async () => {
    confirm.mockResolvedValue(false);
    const tela = criar(plano([sala(1)], [turma('EF3A-M')]));

    await tela.copiar();

    expect(api.getPlanoCopiaAno).toHaveBeenCalled();
    expect(api.copiarSalasDoAno).not.toHaveBeenCalled();
    expect(api.salvarTurmaXSala).not.toHaveBeenCalled();
    expect(tela.salas().map((s) => tela.situacao(s.estado).rotulo)).toEqual(['Vai ser copiada']);
    expect(tela.copiada()).toBe(false);
    expect(tela.copiando()).toBe(false);
  });

  it('antes de gravar, diz o que muda no destino; tirar turma da sala pede confirmação de risco', async () => {
    const tela = criar(
      plano(
        [sala(1), sala(2, 'atualizar'), sala(3, 'ja-existe')],
        [turma('EF3A-M', 'mover'), turma('EF3A-SM', 'liberar'), turma('EF4F-M', 'liberar'), turma('EF3C-M', 'ja-vinculada')],
      ),
    );

    await tela.copiar();

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Copiar 2026 para 2027?',
        description:
          'Para 2027 ficar igual a 2026: 1 sala copiada e 1 sala atualizada; 1 turma muda de sala e 2 turmas saem da sala. ' +
          'Turmas que só existem em 2027 não são mexidas. A lista completa está na tela.',
        danger: true,
      }),
    );
  });

  it('grava primeiro as turmas que saem das salas, depois as que mudam e as que entram', async () => {
    const sucesso = vi.spyOn(TestBed.inject(ToastService), 'success');
    const tela = criar(
      plano([sala(1, 'atualizar')], [turma('EF3B-M'), turma('EF3A-M', 'mover'), turma('EF4F-M', 'liberar')]),
    );
    api.copiarSalasDoAno.mockReturnValueOnce(of([{ id: '1|2|100|1|1|1|1', situacao: 'atualizada' }]));

    await tela.copiar();

    expect(api.copiarSalasDoAno.mock.calls[0][3]).toEqual(['1|2|100|1|1|1|1']);
    expect(api.salvarTurmaXSala.mock.calls.map((c) => c[0].codTurma)).toEqual(['EF4F-M', 'EF3A-M', 'EF3B-M']);
    // Liberar é o salvar com a sala vazia.
    expect(api.salvarTurmaXSala).toHaveBeenCalledWith({
      codFilial: 2,
      codTurma: 'EF4F-M',
      idPerlet: 300,
      codBloco: '',
      codPredio: '',
      codSala: '',
    });
    expect(tela.resumoTurmas().map((r) => `${r.quantidade} ${r.texto}`)).toEqual([
      '1 colocadas nas salas',
      '1 mudaram de sala',
      '1 saíram da sala',
    ]);
    expect(sucesso).toHaveBeenCalledWith(
      'Cópia concluída',
      '2027 ficou igual a 2026: 1 sala atualizada, 1 turma colocada na sala, 1 turma mudou de sala e 1 turma saiu da sala.',
    );
  });

  it('com o destino já igual à origem, avisa e nem pede confirmação', async () => {
    const info = vi.spyOn(TestBed.inject(ToastService), 'info');
    const tela = criar(plano([sala(1, 'ja-existe')], [turma('EF3A-M', 'ja-vinculada'), turma('EF3B-M', 'sem-turma')]));

    await tela.copiar();

    expect(confirm).not.toHaveBeenCalled();
    expect(api.copiarSalasDoAno).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith('Nada para copiar', '2027 já está igual a 2026 no que dá para copiar.');
    expect(tela.plano()).not.toBeNull();
  });

  it('a sala que vai ser atualizada mostra o valor que o destino tinha', () => {
    const tela = criar();
    tela.plano.set(plano([sala(1, 'atualizar')]));

    expect([tela.salas()[0].carteirasAntes, tela.salas()[0].capacidadeAntes]).toEqual([25, null]);
  });

  it('só quem pode editar copia', async () => {
    somenteLeitura.set(true);
    const tela = criar(plano([sala(1)]));

    await tela.copiar();

    expect(tela.podeCopiar()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('recarrega as salas quando o destino é o ano aberto na tela', async () => {
    const tela = criar(plano([sala(1)]));
    tela.escolherOrigem('2025');
    tela.escolherDestino('2026');

    await tela.copiar();

    expect(api.copiarSalasDoAno.mock.calls[0].slice(0, 3)).toEqual(['bruno', '2025', '2026']);
    expect(carregar).toHaveBeenCalled();
  });

  it('trocar um dos anos descarta o resultado da cópia anterior', async () => {
    const tela = criar(plano([sala(1)]));
    await tela.copiar();

    tela.escolherDestino('2025');

    expect(tela.plano()).toBeNull();
    expect(tela.copiada()).toBe(false);
  });
});
