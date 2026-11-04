import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
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
    // A tela pega a unidade ao abrir; aqui as salas chegam depois, então escolhe a da filial 2.
    planta.onUnidadeChange(salas.unidades()[0].id);
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

    const origem = salas.sala(id('Sala 3'))!;
    const destino = salas.sala(id('Sala 2'))!;
    expect(salas.transferirCarteira(origem, destino, 2)).toBe(true);
    expect(transferir).toHaveBeenCalledTimes(1);
  });
});
