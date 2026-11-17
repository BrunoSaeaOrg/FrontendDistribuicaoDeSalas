import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Unidade } from '../../core/models';
import { ApiEnturmacaoParaImportarDto } from '../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../core/services/ocupacao-api.service';
import { SalasService } from '../../core/services/salas.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { EnturmacaoComponent } from './enturmacao.component';

const TERCEIRO = '3º Ano - Ensino Fundamental - Manhã - EF I';
const QUINTO = '5º Ano - Ensino Fundamental - Manhã - EF I';

const aluno = (ra: string, nome: string, codTurma: string, extra: Partial<ApiEnturmacaoParaImportarDto> = {}): ApiEnturmacaoParaImportarDto => ({
  ra,
  nome,
  serie: TERCEIRO,
  codTurma,
  nomeTurma: `Turma ${codTurma}`,
  ...extra,
});

// Fora de ordem e sem a situação, como o back de antes mandava (só os pendentes): todos pendentes.
const ALUNOS = [
  aluno('3', 'Carla', 'EF3A-M'),
  aluno('1', 'Ana', 'EF3A-M'),
  aluno('2', 'Bruno', 'EF5A-M', { serie: QUINTO }),
  aluno('9', 'Davi', 'EF3B-M'),
];

// Com a situação, como o back manda agora: pendentes, enturmados e quem requer revisão.
const COM_SITUACAO = [
  aluno('1', 'Ana', 'EF3A-M', { situacao: 'pendente' }),
  aluno('3', 'Carla', 'EF3A-M', { situacao: 'importado' }),
  aluno('4', 'Eva', 'EF3B-M', { situacao: 'requer-revisao', obs: 'Aluno(a) já possui turma.' }),
  aluno('9', 'Davi', 'EF3B-M', { situacao: 'pendente' }),
  aluno('7', 'Gil', 'EF3B-M', { situacao: 'importado', obs: 'Revisão antiga.' }),
];

const UNIDADES: Unidade[] = [
  { id: '2', nome: 'CASJ 1', cor: '', codFilial: 2 },
  { id: '13', nome: 'CASJ 2', cor: '', codFilial: 13 },
];

describe('EnturmacaoComponent', () => {
  let fixture: ComponentFixture<EnturmacaoComponent>;
  let tela: EnturmacaoComponent;
  let getLista: ReturnType<typeof vi.fn>;
  let importar: ReturnType<typeof vi.fn>;
  let confirmar: ReturnType<typeof vi.fn>;
  let toast: { info: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn> };
  const anoLetivo = signal('2027');

  function montar(resposta: () => Observable<ApiEnturmacaoParaImportarDto[]> = () => of(ALUNOS)): void {
    anoLetivo.set('2027');
    getLista = vi.fn(resposta);
    importar = vi.fn();
    confirmar = vi.fn(async () => true);
    toast = { info: vi.fn(), success: vi.fn(), warning: vi.fn(), danger: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OcupacaoApiService,
          useValue: {
            getParaImportarEnturmacao: getLista,
            getFotosEnturmacao: vi.fn(() => of({})),
            importarEnturmacao: importar,
          },
        },
        { provide: AuthService, useValue: { currentUser: signal({ username: 'fulano' }) } },
        {
          provide: SalasService,
          useValue: {
            anoLetivo,
            anoCarregado: anoLetivo,
            anosLetivos: signal(['2026', '2027']),
            salas: signal([]),
            turmasLivres: signal([]),
            unidades: signal(UNIDADES),
            nomeDaFilial: (cod: number) => (cod === 2 ? 'CASJ 1' : 'CASJ 2'),
            selecionarAno: (ano: string) => anoLetivo.set(ano),
          },
        },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmDialogService, useValue: { confirm: confirmar } },
      ],
    });
    fixture = TestBed.createComponent(EnturmacaoComponent);
    fixture.detectChanges();
    tela = fixture.componentInstance;
  }

  function abrir(): void {
    tela.selecionarUnidade('2');
    TestBed.tick();
  }

  const nomes = () => tela.visiveis().map((a) => a.nome);

  it('só lê ao escolher a unidade; a lista vem em ordem alfabética, com a série sem o nível e o turno', () => {
    montar();
    expect(getLista).not.toHaveBeenCalled();

    abrir();

    expect(getLista).toHaveBeenCalledWith('fulano', '2027', 2);
    expect(nomes()).toEqual(['Ana', 'Bruno', 'Carla', 'Davi']);
    expect(tela.visiveis().map((a) => a.serie)).toEqual(['3º Ano', '5º Ano', '3º Ano', '3º Ano']);
    // Sem a situação (back de antes desta versão), todos são pendentes: cada linha mostra Pendente.
    fixture.detectChanges();
    const situacoes = [...(fixture.nativeElement as HTMLElement).querySelectorAll('tbody app-badge')].map((b) => b.textContent?.trim());
    expect(situacoes).toEqual(['Pendente', 'Pendente', 'Pendente', 'Pendente']);
  });

  it('a busca (sem acento, ou RA) e a série filtram', () => {
    montar();
    abrir();

    tela.busca.set('CÁRLA');
    expect(nomes()).toEqual(['Carla']);
    tela.busca.set('9');
    expect(tela.visiveis().map((a) => a.id)).toEqual(['9']);
    tela.busca.set('');

    expect(tela.serieOptions().map((o) => o.label)).toEqual(['Todas as séries', '3º Ano - Ensino Fundamental', '5º Ano - Ensino Fundamental']);
    tela.selecionarSerie('3º Ano - Ensino Fundamental');
    expect(nomes()).toEqual(['Ana', 'Carla', 'Davi']);
  });

  it('a turma filtra; as turmas listadas são as da série, e trocar para outra série solta a turma', () => {
    montar();
    abrir();

    expect(tela.turmaOptions().map((o) => o.label)).toEqual([
      'Todas as turmas',
      'Turma EF3A-M (EF3A-M)',
      'Turma EF3B-M (EF3B-M)',
      'Turma EF5A-M (EF5A-M)',
    ]);
    tela.selecionarTurma('EF3A-M');
    expect(nomes()).toEqual(['Ana', 'Carla']);

    // A turma é do 3º ano: continua escolhida na série dela.
    tela.selecionarSerie('3º Ano - Ensino Fundamental');
    expect(tela.turma()).toBe('EF3A-M');
    expect(tela.turmaOptions().map((o) => o.value)).toEqual(['', 'EF3A-M', 'EF3B-M']);

    // No 5º ano ela não existe: volta para todas as turmas.
    tela.selecionarSerie('5º Ano - Ensino Fundamental');
    expect(tela.turma()).toBe('');
    expect(nomes()).toEqual(['Bruno']);
  });

  it('marca um a um ou todos os da lista pelo cabeçalho (que também desmarca); o resumo conta alunos e turmas', () => {
    montar();
    abrir();
    expect(tela.resumoDaSelecao()).toBe('Nenhum aluno marcado');

    tela.definirMarcado('1', true);
    expect(tela.resumoDaSelecao()).toBe('1 aluno marcado · 1 turma');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Limpar seleção');

    tela.limparMarcados();
    tela.alternarVisiveis(true);
    expect(tela.alunosMarcados().map((a) => a.id)).toEqual(['1', '2', '3', '9']);
    expect(tela.resumoDaSelecao()).toBe('4 alunos marcados · 3 turmas');
    tela.alternarVisiveis(false);
    expect(tela.resumoDaSelecao()).toBe('Nenhum aluno marcado');

    // Com a turma filtrada, o cabeçalho marca só os dela.
    tela.selecionarTurma('EF3A-M');
    tela.alternarVisiveis(true);
    expect(tela.todosVisiveisMarcados()).toBe(true);
    expect(tela.alunosMarcados().map((a) => a.id)).toEqual(['1', '3']);
  });

  it('abre em todas as situações (os enturmados ficam na lista); o filtro conta cada uma e mostra o motivo do inconsistente', () => {
    montar(() => of(COM_SITUACAO));
    abrir();

    expect(tela.situacao()).toBe('');
    expect(tela.situacaoOptions().map((o) => o.label)).toEqual([
      'Todas as situações (5)',
      'Pendentes (2)',
      'Enturmados (2)',
      'Inconsistentes (1)',
    ]);

    fixture.detectChanges();
    expect(nomes()).toEqual(['Ana', 'Carla', 'Davi', 'Eva', 'Gil']);
    const el = fixture.nativeElement as HTMLElement;
    const situacoes = [...el.querySelectorAll('tbody app-badge')].map((b) => b.textContent?.trim());
    expect(situacoes).toEqual(['Pendente', 'Enturmado', 'Pendente', 'Inconsistente', 'Enturmado']);
    // O motivo só aparece em quem requer revisão; só os pendentes têm a caixa de marcar.
    expect([...el.querySelectorAll('.en-motivo')].map((m) => m.textContent?.trim())).toEqual(['Aluno(a) já possui turma.']);
    expect(el.querySelectorAll('tbody saea-checkbox').length).toBe(2);

    tela.selecionarSituacao('pendente');
    expect(nomes()).toEqual(['Ana', 'Davi']);
    tela.selecionarSituacao('revisao');
    expect(nomes()).toEqual(['Eva']);
    // A contagem segue a turma escolhida.
    tela.selecionarTurma('EF3A-M');
    expect(tela.situacaoOptions().map((o) => o.label)).toEqual([
      'Todas as situações (2)',
      'Pendentes (1)',
      'Enturmados (1)',
      'Inconsistentes (0)',
    ]);
    expect(tela.textoSemResultado()).toBe('Nenhum aluno inconsistente com esse filtro.');
  });

  it('o cabeçalho marca só os pendentes da lista, e o botão Enturmar conta só eles', () => {
    montar(() => of(COM_SITUACAO));
    abrir();
    tela.selecionarSituacao('');

    tela.alternarVisiveis(true);
    expect(tela.alunosMarcados().map((a) => a.id)).toEqual(['1', '9']);
    expect(tela.todosVisiveisMarcados()).toBe(true);
    expect(tela.textoImportar()).toBe('Enturmar 2 alunos');
    // Um enturmado marcado à mão não vai.
    tela.definirMarcado('3', true);
    expect(tela.alunosMarcados().map((a) => a.id)).toEqual(['1', '9']);

    // Só enturmados na lista: não há o que marcar.
    tela.selecionarSituacao('enturmado');
    expect(tela.visiveisPendentes()).toEqual([]);
    expect([tela.todosVisiveisMarcados(), tela.visiveisEmParte()]).toEqual([false, false]);
  });

  it('só com enturmados, eles continuam na lista sem caixa de marcar; no filtro Pendentes, não há ninguém para enturmar', () => {
    montar(() => of([aluno('3', 'Carla', 'EF3A-M', { situacao: 'importado' })]));
    abrir();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(nomes()).toEqual(['Carla']);
    expect([...el.querySelectorAll('tbody app-badge')].map((b) => b.textContent?.trim())).toEqual(['Enturmado']);
    expect(el.querySelectorAll('tbody saea-checkbox').length).toBe(0);

    tela.selecionarSituacao('pendente');
    fixture.detectChanges();
    expect(nomes()).toEqual([]);
    expect(el.textContent).toContain('Nenhum aluno pendente para enturmar.');
  });

  it('quem acabou de ser enturmado continua na lista, agora como Enturmado', async () => {
    let lista: ApiEnturmacaoParaImportarDto[] = [
      aluno('1', 'Ana', 'EF3A-M', { situacao: 'pendente' }),
      aluno('3', 'Carla', 'EF3A-M', { situacao: 'importado' }),
    ];
    montar(() => of(lista));
    abrir();
    tela.definirMarcado('1', true);
    importar.mockReturnValueOnce(of({ concluido: true, alunos: [{ ra: '1', situacao: 'importado', obs: null }] }));
    // Relida depois da FV, a Ana vem como importada.
    lista = [aluno('1', 'Ana', 'EF3A-M', { situacao: 'importado' }), aluno('3', 'Carla', 'EF3A-M', { situacao: 'importado' })];

    await tela.importar();
    fixture.detectChanges();

    expect(getLista).toHaveBeenCalledTimes(2);
    expect(nomes()).toEqual(['Ana', 'Carla']);
    const el = fixture.nativeElement as HTMLElement;
    expect([...el.querySelectorAll('tbody app-badge')].map((b) => b.textContent?.trim())).toEqual(['Enturmado', 'Enturmado']);
  });

  it('enturmar confirma, manda os marcados para a FV, avisa como ficou cada grupo e relê a lista', async () => {
    montar();
    abrir();
    tela.definirMarcado('1', true);
    tela.definirMarcado('2', true);
    tela.definirMarcado('3', true);
    importar.mockReturnValueOnce(
      of({
        concluido: true,
        alunos: [
          { ra: '1', situacao: 'importado', obs: null },
          { ra: '2', situacao: 'requer-revisao', obs: 'Aluno(a) já possui turma.' },
          { ra: '3', situacao: 'pendente', obs: null },
        ],
      }),
    );

    await tela.importar();

    expect(confirmar).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Enturmar 3 alunos na matrícula?',
        description:
          'A FV de enturmação do RM grava a turma de destino na matrícula de cada aluno (2 turmas) e o matricula nas ' +
          'disciplinas dela. Não dá para desfazer por esta tela.',
      }),
    );
    expect(importar).toHaveBeenCalledWith('fulano', '2027', 2, ['1', '2', '3']);
    expect(toast.success).toHaveBeenCalledWith('1 aluno enturmado', 'Já estão na matrícula, na turma de destino.');
    // Quem foi para revisão fica na lista com essa situação: o aviso leva o motivo e o que fazer.
    expect(toast.warning).toHaveBeenCalledWith(
      '1 aluno ficou inconsistente',
      'Aluno(a) já possui turma. Ficaram como "Inconsistente": confira a matrícula no RM (na Pré-enturmação eles ficam travados).',
    );
    expect(toast.info).toHaveBeenCalledWith('1 aluno continua pendente', 'A FV não chegou a processar. Tente enturmar de novo.');
    // Relê a lista (a FV mudou os registros) e a seleção começa do zero.
    expect(getLista).toHaveBeenCalledTimes(2);
    expect([tela.importando(), tela.marcados().size]).toEqual([false, 0]);
  });

  it('cancelar não enturma; sem concluir, avisa que o RM ainda está enturmando; erro avisa a causa e relê', async () => {
    montar();
    abrir();
    tela.definirMarcado('1', true);

    confirmar.mockResolvedValueOnce(false);
    await tela.importar();
    expect(importar).not.toHaveBeenCalled();

    importar.mockReturnValueOnce(of({ concluido: false, alunos: [{ ra: '1', situacao: 'pendente', obs: null }] }));
    await tela.importar();
    expect(toast.info).toHaveBeenCalledWith('O RM ainda está enturmando', 'Recarregue a lista em alguns instantes para ver como ficou cada aluno.');
    expect(toast.success).not.toHaveBeenCalled();

    tela.definirMarcado('1', true);
    importar.mockReturnValueOnce(throwError(() => ({ error: { message: 'O RM não importou a enturmação: Violação de chave' } })));
    await tela.importar();
    expect(toast.danger).toHaveBeenCalledWith('Não foi possível enturmar', 'O RM não importou a enturmação: Violação de chave');
    expect(getLista).toHaveBeenCalledTimes(3);
  });

  it('sem marcados, o botão Enturmar fica desligado e não pergunta nada', async () => {
    montar();
    abrir();
    fixture.detectChanges();

    const botao = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('app-button.en-importar button')!;
    expect(botao.disabled).toBe(true);
    expect(botao.textContent?.trim()).toContain('Enturmar');

    tela.definirMarcado('1', true);
    fixture.detectChanges();
    expect(botao.disabled).toBe(false);
    expect(botao.textContent).toContain('Enturmar 1 aluno');
    tela.limparMarcados();
    await tela.importar();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it('erro na leitura mostra o aviso; tentar de novo relê', () => {
    let falhar = true;
    montar(() => (falhar ? throwError(() => new Error('RM fora')) : of(ALUNOS)));
    abrir();
    expect(tela.comErro()).toBe(true);

    falhar = false;
    tela.tentarDeNovo();
    expect(getLista).toHaveBeenCalledTimes(2);
    expect(tela.pronto()).toBe(true);
  });

  it('trocar de unidade relê e limpa os filtros e os marcados (a situação volta a todas)', () => {
    montar();
    abrir();
    tela.selecionarTurma('EF3A-M');
    tela.selecionarSituacao('pendente');
    tela.busca.set('ana');
    tela.definirMarcado('1', true);

    tela.selecionarUnidade('13');
    TestBed.tick();

    expect(getLista).toHaveBeenLastCalledWith('fulano', '2027', 13);
    expect([tela.turma(), tela.busca(), tela.marcados().size, tela.situacao()]).toEqual(['', '', 0, '']);
  });
});
