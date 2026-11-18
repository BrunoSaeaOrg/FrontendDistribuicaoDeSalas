import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
