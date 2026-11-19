import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AlunosEnturmacaoService, lerUltimaUnidade } from './alunos-enturmacao.service';
import { OcupacaoApiService } from './ocupacao-api.service';
import { chaveDoColaborador } from './preferencias.service';

describe('AlunosEnturmacaoService (pré-carregar a última unidade aberta)', () => {
  let getAlunos: ReturnType<typeof vi.fn>;
  const usuario = signal<{ username: string } | null>(null);

  function criar(): AlunosEnturmacaoService {
    getAlunos = vi.fn(() => of([]));
    TestBed.configureTestingModule({
      providers: [
        { provide: OcupacaoApiService, useValue: { getAlunosEnturmacao: getAlunos } },
        { provide: AuthService, useValue: { currentUser: usuario } },
      ],
    });
    return TestBed.inject(AlunosEnturmacaoService);
  }

  beforeEach(() => {
    localStorage.clear();
    usuario.set(null);
  });

  it('guarda a unidade aberta por colaborador', () => {
    usuario.set({ username: 'fulano' });
    const servico = criar();
    TestBed.tick();
    // Nada guardado ainda: nada a pré-carregar.
    expect(getAlunos).not.toHaveBeenCalled();

    servico.lembrarUnidade('2026', 2);
    expect(lerUltimaUnidade('fulano')).toEqual({ ano: '2026', codFilial: 2 });
    expect(lerUltimaUnidade('beltrano')).toBeNull();
  });

  it('ao entrar, já lê os alunos da última unidade que o colaborador abriu', () => {
    usuario.set({ username: 'fulano' });
    criar().lembrarUnidade('2026', 2);
    TestBed.resetTestingModule();

    // O app abre na tela de login: ainda não sabe de quem é.
    usuario.set(null);
    const servico = criar();
    TestBed.tick();
    expect(getAlunos).not.toHaveBeenCalled();

    usuario.set({ username: 'fulano' });
    TestBed.tick();
    expect(getAlunos).toHaveBeenCalledExactlyOnceWith('2026', 2);
    expect(servico.estado('2026', 2)?.estado).toBe('pronto');
  });

  it('o que foi guardado fora do formato não pré-carrega nada', () => {
    localStorage.setItem(`${chaveDoColaborador('fulano')}.enturmacao`, JSON.stringify({ ano: '26;CODFILIAL=6', codFilial: 2 }));
    usuario.set({ username: 'fulano' });
    criar();
    TestBed.tick();
    expect(getAlunos).not.toHaveBeenCalled();
  });
});

describe('AlunosEnturmacaoService (fotos)', () => {
  let getFotos: ReturnType<typeof vi.fn>;
  /** A resposta de cada pedido, por ordem de chegada; sem resposta, o pedido fica no ar. */
  let respostas: Subject<Record<string, string>>[];

  function criar(): AlunosEnturmacaoService {
    respostas = [];
    getFotos = vi.fn(() => {
      const resposta = new Subject<Record<string, string>>();
      respostas.push(resposta);
      return resposta;
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: OcupacaoApiService, useValue: { getAlunosEnturmacao: () => of([]), getFotosEnturmacao: getFotos } },
        { provide: AuthService, useValue: { currentUser: signal(null) } },
      ],
    });
    return TestBed.inject(AlunosEnturmacaoService);
  }

  it('pede uma série por vez: a que chega primeiro já aparece, sem esperar a outra', () => {
    const servico = criar();
    servico.fotosPara('2027', 2, [
      { ra: '1', serie: '2|4' },
      { ra: '2', serie: '2|5' },
      { ra: '3', serie: '2|4' },
      { ra: '1', serie: '2|4' },
    ]);

    expect(getFotos.mock.calls.map((c) => c[2])).toEqual([['1', '3'], ['2']]);

    respostas[1].next({ '2': 'data:image/jpeg;base64,2' });
    expect(servico.foto('2027', 2, '2')).toBe('data:image/jpeg;base64,2');
    expect(servico.foto('2027', 2, '1')).toBeNull();

    // Pedidos já feitos não se repetem, nem os que ainda estão no ar.
    servico.fotosPara('2027', 2, [{ ra: '1', serie: '2|4' }, { ra: '2', serie: '2|5' }]);
    expect(getFotos).toHaveBeenCalledTimes(2);
  });

  it('série com mais de 200 alunos vai em mais de um pedido', () => {
    const servico = criar();
    servico.fotosPara('2027', 2, Array.from({ length: 250 }, (_, i) => ({ ra: String(i), serie: '2|5' })));
    expect(getFotos.mock.calls.map((c) => (c[2] as string[]).length)).toEqual([200, 50]);
  });

  it('o pedido que falha volta a ser feito na próxima vez', () => {
    const servico = criar();
    servico.fotosPara('2027', 2, [{ ra: '1', serie: '2|4' }]);
    respostas[0].error(new Error('RM fora do ar'));

    servico.fotosPara('2027', 2, [{ ra: '1', serie: '2|4' }]);
    expect(getFotos).toHaveBeenCalledTimes(2);
  });
});
