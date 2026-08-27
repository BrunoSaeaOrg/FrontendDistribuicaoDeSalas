import { computed, Injectable, signal } from '@angular/core';
import { buildUnidades, gerarSalas } from '../mock/mock-data.generator';
import { Sala, StatusInfo, StatusOcupacao, Turno, TurmaVinculada, Unidade } from '../models';
import { RegrasService } from './regras.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class SalasService {
  private readonly _unidades = signal<Unidade[]>(buildUnidades());
  private readonly _salas = signal<Sala[]>(gerarSalas(this._unidades()));

  readonly unidades = this._unidades.asReadonly();
  readonly salas = this._salas.asReadonly();

  readonly totalSalas = computed(() => this._salas().length);
  readonly totalCarteiras = computed(() => this._salas().reduce((a, s) => a + s.carteiras, 0));
  readonly totalCapacidade = computed(() =>
    this._salas().reduce((a, s) => a + this.capacidade(s), 0),
  );
  readonly totalVagas = computed(() =>
    this._salas().reduce((a, s) => a + Math.max(0, this.capacidade(s) - s.carteiras), 0),
  );

  constructor(
    private readonly regrasService: RegrasService,
    private readonly toast: ToastService,
  ) {}

  unidade(id: string): Unidade | undefined {
    return this._unidades().find((u) => u.id === id);
  }

  sala(id: string): Sala | undefined {
    return this._salas().find((s) => s.id === id);
  }

  salasDaUnidade(unidadeId: string): Sala[] {
    return this._salas().filter((s) => s.unidadeId === unidadeId);
  }

  capacidade(sala: Sala): number {
    const { areaPorAluno } = this.regrasService.regras();
    return Math.max(1, Math.floor(sala.area / (areaPorAluno || 1.5)));
  }

  statusInfo(sala: Sala): StatusInfo {
    const cap = this.capacidade(sala);
    const ratio = sala.carteiras / cap;
    const limite = (this.regrasService.regras().pctMaximoUtilizacao ?? 90) / 100;
    if (ratio > 1) return { label: 'Excedida', tone: 'danger', key: 'excedida' as StatusOcupacao };
    if (ratio >= limite) return { label: 'Quase lotada', tone: 'warning', key: 'quase' as StatusOcupacao };
    return { label: 'Disponível', tone: 'success', key: 'disponivel' as StatusOcupacao };
  }

  segmentoFromNome(nome: string): string {
    if (/infantil/i.test(nome)) return 'Educação Infantil';
    const m = nome.match(/^(\d+)º Ano/);
    if (m) {
      const n = parseInt(m[1], 10);
      return n <= 5 ? 'Fundamental I' : 'Fundamental II';
    }
    if (/Série EM/i.test(nome)) return 'Ensino Médio';
    return 'Outros';
  }

  serieFromNome(nome: string): string {
    return nome.replace(/\s+[A-Z]$/, '').trim();
  }

  moveCarteira(sourceId: string, targetId: string, editorMode: boolean): void {
    if (!editorMode || sourceId === targetId) return;
    const salas = this._salas().map((s) => ({ ...s }));
    const source = salas.find((s) => s.id === sourceId);
    const target = salas.find((s) => s.id === targetId);
    if (!source || !target || source.carteiras <= 0) return;

    const targetCap = this.capacidade(target);
    if (target.carteiras + 1 > targetCap && !this.regrasService.regras().permitirExcesso) {
      this.toast.danger(
        'Sem espaço físico',
        `${target.nome} já está na capacidade máxima (${targetCap} carteiras).`,
      );
      return;
    }

    source.carteiras -= 1;
    target.carteiras += 1;
    const overNote = target.carteiras > targetCap ? ' (acima da capacidade recomendada)' : '';
    this._salas.set(salas);
    this.toast.success('Carteira movida', `1 carteira de ${source.nome} para ${target.nome}${overNote}.`);
  }

  setTurmaField(
    salaId: string,
    turno: Turno,
    field: keyof TurmaVinculada,
    value: string,
  ): void {
    this._salas.update((list) =>
      list.map((s) => {
        if (s.id !== salaId) return s;
        const turnos = { ...s.turnos };
        const cur = turnos[turno] ?? { nome: '', nomeProprio: '', alunos: 0 };
        turnos[turno] = { ...cur, [field]: field === 'alunos' ? Number(value) || 0 : value };
        return { ...s, turnos };
      }),
    );
  }

  liberarTurno(salaId: string, turno: Turno): void {
    this._salas.update((list) =>
      list.map((s) => (s.id === salaId ? { ...s, turnos: { ...s.turnos, [turno]: null } } : s)),
    );
  }

  vincularTurno(salaId: string, turno: Turno): void {
    this._salas.update((list) =>
      list.map((s) =>
        s.id === salaId
          ? {
              ...s,
              turnos: {
                ...s.turnos,
                [turno]: {
                  nome: 'Nova turma',
                  nomeProprio: 'Turma nova',
                  alunos: Math.min(s.carteiras, Math.max(6, Math.round(s.carteiras * 0.8))),
                },
              },
            }
          : s,
      ),
    );
  }

  adicionarCarteiras(salaId: string, quantidade: number): void {
    this._salas.update((list) =>
      list.map((s) => (s.id === salaId ? { ...s, carteiras: s.carteiras + quantidade } : s)),
    );
  }
}
