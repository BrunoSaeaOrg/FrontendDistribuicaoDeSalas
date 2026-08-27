import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SalasService } from '../../core/services/salas.service';
import { Turno } from '../../core/models';
import { CardComponent } from '../../shared/ui/card/card.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

type OcupVis = 'tabela' | 'evolucao' | 'colunas';
type Agrupador = 'unidade' | 'turno' | 'segmento' | 'serie' | 'turma';

interface Grupo {
  key: string;
  label: string;
  color: string;
  alunos: number;
  capacidade: number;
  pct: number;
  excede: boolean;
  alunosColor: string;
}

interface EntradaOcupacao {
  unidadeId: string;
  unidadeNome: string;
  unidadeCor: string;
  turno: Turno;
  segmento: string;
  serie: string;
  turma: string;
  alunos: number;
  capacidade: number;
}

const PALETTE = ['#2e9cb5', '#268298', '#57b8cc', '#7fcbda', '#1c6577', '#134a56', '#9fdbe6'];
const TURNOS: Turno[] = ['manha', 'tarde'];

@Component({
  selector: 'app-ocupacao',
  standalone: true,
  imports: [FormsModule, CardComponent, EmptyStateComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ocupacao.component.html',
  styleUrl: './ocupacao.component.css',
})
export class OcupacaoComponent {
  private readonly salasService = inject(SalasService);

  readonly ano = signal('2026');
  readonly unidade = signal('todas');
  readonly turno = signal('todas');
  readonly segmento = signal('todas');
  readonly agrupar = signal<Agrupador>('unidade');
  readonly vis = signal<OcupVis>('tabela');
  readonly evolHoverIdx = signal<number | null>(null);

  readonly anoOptions: SelectOption[] = [
    { value: '2024', label: '2024' },
    { value: '2025', label: '2025' },
    { value: '2026', label: '2026' },
  ];

  readonly unidadeOptions = computed<SelectOption[]>(() => {
    const base = this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome }));
    return this.vis() === 'evolucao' ? base : [{ value: 'todas', label: 'Todas as unidades' }, ...base];
  });

  readonly turnoOptions: SelectOption[] = [
    { value: 'todas', label: 'Todos os turnos' },
    { value: 'manha', label: 'Manhã' },
    { value: 'tarde', label: 'Tarde' },
  ];
  readonly segmentoOptions: SelectOption[] = [
    { value: 'todas', label: 'Todos os segmentos' },
    { value: 'Educação Infantil', label: 'Educação Infantil' },
    { value: 'Fundamental I', label: 'Fundamental I' },
    { value: 'Fundamental II', label: 'Fundamental II' },
    { value: 'Ensino Médio', label: 'Ensino Médio' },
  ];
  readonly agruparOptions: { value: Agrupador; label: string }[] = [
    { value: 'unidade', label: 'Unidade' },
    { value: 'turno', label: 'Turno' },
    { value: 'segmento', label: 'Segmento' },
    { value: 'serie', label: 'Série' },
    { value: 'turma', label: 'Turma' },
  ];
  readonly visTabs: { value: OcupVis; label: string }[] = [
    { value: 'tabela', label: 'Tabela' },
    { value: 'evolucao', label: 'Evolução' },
    { value: 'colunas', label: 'Colunas' },
  ];

  readonly showExtraFiltros = computed(() => this.vis() !== 'evolucao');
  readonly agruparLabel = computed(
    () => this.agruparOptions.find((o) => o.value === this.agrupar())?.label ?? '',
  );

  private readonly entradas = computed<EntradaOcupacao[]>(() => {
    const list: EntradaOcupacao[] = [];
    this.salasService.salas().forEach((s) => {
      const u = this.salasService.unidade(s.unidadeId)!;
      TURNOS.forEach((turno) => {
        const t = s.turnos[turno];
        if (!t) return;
        list.push({
          unidadeId: s.unidadeId,
          unidadeNome: u.nome,
          unidadeCor: u.cor,
          turno,
          segmento: this.salasService.segmentoFromNome(t.nome),
          serie: this.salasService.serieFromNome(t.nome),
          turma: t.nomeProprio || t.nome,
          alunos: t.alunos,
          capacidade: this.salasService.capacidade(s),
        });
      });
    });
    return list;
  });

  readonly grupos = computed<Grupo[]>(() => {
    let entradas = this.entradas();
    if (this.unidade() !== 'todas') entradas = entradas.filter((e) => e.unidadeId === this.unidade());
    if (this.turno() !== 'todas') entradas = entradas.filter((e) => e.turno === this.turno());
    if (this.segmento() !== 'todas') entradas = entradas.filter((e) => e.segmento === this.segmento());

    const keyFor = (e: EntradaOcupacao): { key: string; label: string; color: string | null } => {
      switch (this.agrupar()) {
        case 'unidade':
          return { key: e.unidadeId, label: e.unidadeNome, color: e.unidadeCor };
        case 'turno':
          return { key: e.turno, label: e.turno === 'manha' ? 'Manhã' : 'Tarde', color: null };
        case 'segmento':
          return { key: e.segmento, label: e.segmento, color: null };
        case 'serie':
          return { key: e.serie, label: e.serie, color: null };
        default:
          return { key: e.unidadeId + '|' + e.turma, label: `${e.turma} (${e.unidadeNome})`, color: null };
      }
    };

    const map = new Map<string, Grupo>();
    entradas.forEach((e) => {
      const k = keyFor(e);
      const existing = map.get(k.key);
      if (existing) {
        existing.alunos += e.alunos;
        existing.capacidade += e.capacidade;
      } else {
        map.set(k.key, {
          key: k.key,
          label: k.label,
          color: k.color ?? '',
          alunos: e.alunos,
          capacidade: e.capacidade,
          pct: 0,
          excede: false,
          alunosColor: '',
        });
      }
    });

    return Array.from(map.values())
      .sort((a, b) => b.alunos - a.alunos)
      .map((g, i) => {
        const pct = g.capacidade > 0 ? Math.round((g.alunos / g.capacidade) * 100) : 0;
        const excede = g.alunos > g.capacidade;
        return {
          ...g,
          color: g.color || PALETTE[i % PALETTE.length],
          pct,
          excede,
          alunosColor: excede ? 'var(--saea-danger)' : 'var(--saea-primary)',
        };
      });
  });

  readonly hasData = computed(() => this.grupos().length > 0);

  // --- Colunas ---
  readonly barRows = computed(() => {
    const CHART_H = 440;
    const grupos = this.grupos();
    const maxAbs = Math.max(1, ...grupos.map((g) => g.capacidade));
    return grupos.map((g) => {
      const capH = Math.round((g.capacidade / maxAbs) * CHART_H);
      const alunosH = Math.round((g.alunos / maxAbs) * CHART_H);
      const pctH = Math.round(Math.min(1, g.pct / 100) * capH);
      const tooltip = `${g.label}\nAlunos: ${g.alunos}\nCapacidade: ${g.capacidade}\nOcupação: ${g.pct}%${g.excede ? ' — ACIMA DA CAPACIDADE (lei de evacuação)' : ''}`;
      return { ...g, capacidadeBarHeight: capH, alunosOfCapHeight: alunosH, pctOfCapHeight: pctH, tooltip };
    });
  });

  // --- Evolução mensal ---
  readonly unidadeEvolucao = computed(
    () => this.salasService.unidade(this.unidade()) ?? this.salasService.unidades()[0],
  );

  private hashStr(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  private mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  readonly evolSeries = computed(() => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const unidade = this.unidadeEvolucao();
    if (!unidade) return [];
    const salasUnidade = this.salasService.salasDaUnidade(unidade.id);
    const capBase = salasUnidade.reduce((a, s) => a + this.salasService.capacidade(s), 0);
    const rng = this.mulberry32(this.hashStr(unidade.id + '|' + this.ano()));
    const boostMonth = 6 + Math.floor(rng() * 3);
    const boostAmount = Math.round(capBase * (0.06 + rng() * 0.06));
    const alunosBase = Math.round(capBase * (0.76 + rng() * 0.08));

    return meses.map((mes, m) => {
      const capacidade = capBase + (m >= boostMonth ? boostAmount : 0);
      const ramp = alunosBase + Math.round(capBase * 0.3 * Math.min(1, m / 7));
      const noise = Math.round((rng() - 0.5) * capBase * 0.05);
      let alunos = ramp + noise;
      if (m >= boostMonth) alunos = Math.min(alunos, capacidade - Math.round(capBase * 0.02));
      alunos = Math.max(Math.round(capBase * 0.55), alunos);
      const excede = alunos > capacidade;
      return { mes, alunos, capacidade, excede, pct: capacidade > 0 ? Math.round((alunos / capacidade) * 100) : 0 };
    });
  });

  readonly evolMaxAlunos = computed(() => {
    const series = this.evolSeries();
    return Math.max(1, ...series.map((s) => s.capacidade)) * 1.15;
  });

  readonly evolHovered = computed(() => {
    const idx = this.evolHoverIdx();
    const series = this.evolSeries();
    if (idx === null || !series[idx]) return null;
    const s = series[idx];
    return { ...s, excedentePct: Math.max(0, s.pct - 100) };
  });

  onEvolMouseMove(event: MouseEvent, chartW: number, colW: number, padL: number): void {
    const target = event.currentTarget as SVGSVGElement;
    const rect = target.getBoundingClientRect();
    const scale = chartW / rect.width;
    const relX = (event.clientX - rect.left) * scale - padL;
    let idx = Math.round(relX / colW);
    idx = Math.max(0, Math.min(this.evolSeries().length - 1, idx));
    if (idx !== this.evolHoverIdx()) this.evolHoverIdx.set(idx);
  }
  onEvolMouseLeave(): void {
    this.evolHoverIdx.set(null);
  }

  readonly evolChartW = 760;
  readonly evolPadL = 46;
  readonly evolColW = computed(() => {
    const n = this.evolSeries().length;
    return n > 1 ? (this.evolChartW - this.evolPadL - 16) / (n - 1) : 0;
  });

  evolPointX(idx: number): number {
    return Math.round((this.evolPadL + idx * this.evolColW()) * 10) / 10;
  }

  onVisChange(v: OcupVis): void {
    this.vis.set(v);
    if (v === 'evolucao' && this.unidade() === 'todas') {
      const first = this.salasService.unidades()[0];
      if (first) this.unidade.set(first.id);
    }
  }
}
