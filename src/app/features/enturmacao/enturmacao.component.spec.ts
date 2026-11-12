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

const aluno = (ra: string, nome: string | null, codTurma: string, extra: Partial<ApiEnturmacaoParaImportarDto> = {}): ApiEnturmacaoParaImportarDto => ({
  ra,
  nome,
  serie: nome === null ? null : TERCEIRO,
  codTurma,
  nomeTurma: `Turma ${codTurma}`,
  situacao: 'pendente',
  obs: null,
  ...extra,
});

// Fora de ordem, como o back manda. O RA 9 saiu da unidade no ano: vem sem nome nem série.
const ALUNOS = [
  aluno('3', 'Carla', 'EF3A-M'),
  aluno('1', 'Ana', 'EF3A-M'),
  aluno('2', 'Bruno', 'EF5A-M', { serie: QUINTO, situacao: 'requer-revisao', obs: 'Duas matrículas no ano.' }),
  aluno('9', null, 'EF3B-M'),
];

const UNIDADES: Unidade[] = [
  { id: '2', nome: 'CASJ 1', cor: '', codFilial: 2 },
  { id: '13', nome: 'CASJ 2', cor: '', codFilial: 13 },
];

describe('EnturmacaoComponent', () => {
  let fixture: ComponentFixture<EnturmacaoComponent>;
  let tela: EnturmacaoComponent;
  let getLista: ReturnType<typeof vi.fn>;
  let confirmar: ReturnType<typeof vi.fn>;
  let toast: { info: ReturnType<typeof vi.fn>; success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn> };
  const anoLetivo = signal('2027');

  function montar(resposta: () => Observable<ApiEnturmacaoParaImportarDto[]> = () => of(ALUNOS)): void {
    anoLetivo.set('2027');
    getLista = vi.fn(resposta);
    confirmar = vi.fn(async () => true);
    toast = { info: vi.fn(), success: vi.fn(), warning: vi.fn(), danger: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OcupacaoApiService,
          useValue: {
            getParaImportarEnturmacao: getLista,
            getFotosEnturmacao: vi.fn(() => of({})),
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

  it('só lê ao escolher a unidade; a lista vem em ordem alfabética, com as abas contando cada situação', () => {
    montar();
    expect(getLista).not.toHaveBeenCalled();

    abrir();

    expect(getLista).toHaveBeenCalledWith('fulano', '2027', 2);
    expect(nomes()).toEqual(['Ana', 'Bruno', 'Carla', 'Sem matrícula ativa no ano']);
    expect(tela.abas().map((t) => t.label)).toEqual(['Todos (4)', 'Pendentes (3)', 'Requer revisão (1)']);
    const semMatricula = tela.visiveis().find((a) => a.id === '9')!;
    expect([semMatricula.semMatricula, semMatricula.serie]).toEqual([true, '—']);
  });

  it('a aba, a busca (sem acento, ou RA) e a série filtram; as abas contam dentro da série', () => {
    montar();
    abrir();

    tela.escolherAba('requer-revisao');
    expect(nomes()).toEqual(['Bruno']);
    tela.escolherAba('todos');

    tela.busca.set('CÁRLA');
    expect(nomes()).toEqual(['Carla']);
    tela.busca.set('9');
    expect(tela.visiveis().map((a) => a.id)).toEqual(['9']);
    tela.busca.set('');

    expect(tela.serieOptions().map((o) => o.label)).toEqual(['Todas as séries', '3º Ano - Ensino Fundamental', '5º Ano - Ensino Fundamental']);
    tela.selecionarSerie('3º Ano - Ensino Fundamental');
    expect(nomes()).toEqual(['Ana', 'Carla']);
    expect(tela.abas().map((t) => t.label)).toEqual(['Todos (2)', 'Pendentes (2)', 'Requer revisão (0)']);
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
    expect(tela.abas().map((t) => t.label)).toEqual(['Todos (2)', 'Pendentes (2)', 'Requer revisão (0)']);

    // A turma é do 3º ano: continua escolhida na série dela.
    tela.selecionarSerie('3º Ano - Ensino Fundamental');
    expect(tela.turma()).toBe('EF3A-M');
    expect(tela.turmaOptions().map((o) => o.value)).toEqual(['', 'EF3A-M']);

    // No 5º ano ela não existe: volta para todas as turmas.
    tela.selecionarSerie('5º Ano - Ensino Fundamental');
    expect(tela.turma()).toBe('');
    expect(nomes()).toEqual(['Bruno']);
  });

  it('marca um a um, todos os da lista pelo cabeçalho ou todos os pendentes; o resumo conta alunos e turmas', () => {
    montar();
    abrir();
    expect(tela.resumoDaSelecao()).toBe('Nenhum aluno marcado');

    tela.definirMarcado('1', true);
    expect(tela.resumoDaSelecao()).toBe('1 aluno marcado · 1 turma');

    tela.limparMarcados();
    tela.marcarPendentes();
    // Os que requerem revisão ficam de fora.
    expect(tela.alunosMarcados().map((a) => a.id)).toEqual(['1', '3', '9']);
    expect(tela.resumoDaSelecao()).toBe('3 alunos marcados · 2 turmas');

    tela.limparMarcados();
    tela.escolherAba('requer-revisao');
    tela.alternarVisiveis(true);
    expect(tela.todosVisiveisMarcados()).toBe(true);
    expect(tela.alunosMarcados().map((a) => a.id)).toEqual(['2']);
  });

  it('importar confirma antes e, por enquanto, só avisa que nada foi enviado ao RM', async () => {
    montar();
    abrir();
    tela.definirMarcado('1', true);
    tela.definirMarcado('2', true);

    await tela.importar();

    expect(confirmar).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Importar 2 alunos para a matrícula?',
        description: 'Cada aluno entra na turma de destino (2 turmas). 1 deles requer revisão: confira a observação antes.',
      }),
    );
    expect(toast.info).toHaveBeenCalledWith('A importação ainda não está ligada ao RM', 'Nada foi enviado: os alunos continuam pendentes.');
    // Continuam na lista e marcados.
    expect(tela.alunosMarcados().map((a) => a.id)).toEqual(['1', '2']);

    toast.info.mockClear();
    confirmar.mockResolvedValueOnce(false);
    await tela.importar();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('sem marcados, o botão de importar fica desligado e importar não pergunta nada', async () => {
    montar();
    abrir();
    fixture.detectChanges();

    const botao = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('app-button.en-importar button')!;
    expect(botao.disabled).toBe(true);
    expect(botao.textContent?.trim()).toContain('Importar');

    tela.definirMarcado('1', true);
    fixture.detectChanges();
    expect(botao.disabled).toBe(false);
    expect(botao.textContent).toContain('Importar 1 aluno');
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

  it('trocar de unidade relê e limpa os filtros e os marcados', () => {
    montar();
    abrir();
    tela.escolherAba('pendente');
    tela.busca.set('ana');
    tela.definirMarcado('1', true);

    tela.selecionarUnidade('13');
    TestBed.tick();

    expect(getLista).toHaveBeenLastCalledWith('fulano', '2027', 13);
    expect([tela.aba(), tela.busca(), tela.marcados().size]).toEqual(['todos', '', 0]);
  });
});
