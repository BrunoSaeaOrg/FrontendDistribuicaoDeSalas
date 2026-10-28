import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaeaSpinnerComponent } from '@sistemas-saea/saea-design-system';
import { SalasService } from '../../core/services/salas.service';
import { UiModeService } from '../../core/services/ui-mode.service';
import { Turno, TurmaEmOutraSala, TurmaLivre } from '../../core/models';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog/confirm-dialog.service';
import { SelectComponent, SelectOption } from '../../shared/ui/select/select.component';

interface TurmaCell {
  turno: Turno;
  hasTurma: boolean;
  noTurma: boolean;
  nome: string;
  nomeProprio: string;
  alunos: number;
  excede: boolean;
  turmasLivres: TurmaLivre[];
  turmasEmOutraSala: TurmaEmOutraSala[];
  /** Há alguma turma para vincular neste turno (livre ou em outra sala). */
  podeVincular: boolean;
  /** O RM está gravando o vínculo desta célula: o spinner fica no lugar da ação. */
  gravando: boolean;
}

interface TurmaRow {
  id: string;
  unidadeId: string;
  nome: string;
  unidadeNome: string;
  unidadeCor: string;
  carteiras: number;
  cells: TurmaCell[];
}

const TURNOS: Turno[] = ['manha', 'tarde'];

const NOME_TURNO: Record<Turno, string> = { manha: 'manhã', tarde: 'tarde' };

/** Colunas que dá para ordenar clicando no cabeçalho. */
type ColunaOrdem = 'sala' | 'carteiras';

/** "Sala 2" antes de "Sala 10", sem diferenciar maiúsculas nem acentos. */
const COMPARADOR_NOME = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

@Component({
  selector: 'app-turmas',
  standalone: true,
  imports: [FormsModule, BadgeComponent, ButtonComponent, CardComponent, SelectComponent, SaeaSpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './turmas.component.html',
  styleUrl: './turmas.component.css',
})
export class TurmasComponent {
  private readonly salasService = inject(SalasService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  readonly uiMode = inject(UiModeService);

  readonly unidade = signal('todas');

  /** Mesmo ano usado na carga das turmas: a tela mostra de qual ano letivo são os vínculos. */
  readonly anoLetivo = this.salasService.anoLetivo;
  readonly anoLetivoOptions: SelectOption[] = [{ value: this.anoLetivo, label: this.anoLetivo }];

  /** Gravação em andamento: trava vincular/liberar até o RM terminar (evita gravar duas vezes). */
  readonly salvando = this.salasService.salvando;

  /** Muda quando uma escolha é cancelada, para recriar os selects e voltar a "Selecione...". */
  readonly versaoSelecao = signal(0);

  /** Ordenação pelo cabeçalho; null = a ordem em que as salas vêm do RM. */
  readonly ordem = signal<{ coluna: ColunaOrdem; direcao: 'asc' | 'desc' } | null>(null);

  readonly unidadeOptions = computed<SelectOption[]>(() => [
    { value: 'todas', label: 'Todas as unidades' },
    ...this.salasService.unidades().map((u) => ({ value: u.id, label: u.nome })),
  ]);

  readonly rows = computed<TurmaRow[]>(() => {
    const unidade = this.unidade();
    const gravando = this.salasService.gravando();
    let list = this.salasService.salas();
    if (unidade !== 'todas') list = list.filter((s) => s.unidadeId === unidade);

    const rows = list.map((s) => {
      const u = this.salasService.unidade(s.unidadeId)!;
      const cells: TurmaCell[] = TURNOS.map((turno) => {
        const t = s.turnos[turno];
        const turmasLivres = t ? [] : this.salasService.turmasLivresPara(s, turno);
        const turmasEmOutraSala = t ? [] : this.salasService.turmasEmOutraSalaPara(s, turno);
        return {
          turno,
          hasTurma: !!t,
          noTurma: !t,
          nome: t?.nome ?? '',
          nomeProprio: t?.nomeProprio ?? '',
          alunos: t?.alunos ?? 0,
          excede: !!t && t.alunos > s.carteiras,
          turmasLivres,
          turmasEmOutraSala,
          podeVincular: turmasLivres.length + turmasEmOutraSala.length > 0,
          gravando: gravando?.salaId === s.id && gravando.turno === turno,
        };
      });
      return { id: s.id, unidadeId: s.unidadeId, nome: s.nome, unidadeNome: u.nome, unidadeCor: u.cor, carteiras: s.carteiras, cells };
    });

    const ordem = this.ordem();
    if (!ordem) return rows;
    const sinal = ordem.direcao === 'asc' ? 1 : -1;
    // Empate em carteiras desempata pelo nome da sala, sempre em ordem crescente.
    return [...rows].sort((a, b) =>
      ordem.coluna === 'carteiras'
        ? (a.carteiras - b.carteiras) * sinal || COMPARADOR_NOME.compare(a.nome, b.nome)
        : COMPARADOR_NOME.compare(a.nome, b.nome) * sinal,
    );
  });

  /** Clique no cabeçalho: a mesma coluna inverte o sentido; outra começa crescente. */
  ordenarPor(coluna: ColunaOrdem): void {
    this.ordem.update((atual) =>
      atual?.coluna === coluna
        ? { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
        : { coluna, direcao: 'asc' },
    );
  }

  /** aria-sort do cabeçalho: só a coluna ordenada recebe o atributo. */
  ariaOrdem(coluna: ColunaOrdem): 'ascending' | 'descending' | null {
    const ordem = this.ordem();
    if (ordem?.coluna !== coluna) return null;
    return ordem.direcao === 'asc' ? 'ascending' : 'descending';
  }

  iconeOrdem(coluna: ColunaOrdem): string {
    const ordem = this.ordem();
    if (ordem?.coluna !== coluna) return 'unfold_more';
    return ordem.direcao === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  /** Primeiro as turmas sem sala; depois as que estão em outra sala (escolher uma delas move a turma). */
  turmaLivreOptions(cell: TurmaCell): SelectOption[] {
    return [
      { value: '', label: 'Vincular turma...' },
      ...cell.turmasLivres.map((t) => ({ value: t.codTurma, label: `${t.nome} (${t.alunos} alunos)` })),
      ...cell.turmasEmOutraSala.map((t) => ({
        value: t.codTurma,
        label: `${t.nome} (${t.alunos} alunos) · hoje em ${t.salaAtual}`,
      })),
    ];
  }

  async liberar(row: TurmaRow, cell: TurmaCell): Promise<void> {
    const sala = this.salasService.sala(row.id);
    if (!sala) return;
    const ok = await this.confirmDialog.confirm({
      title: 'Liberar turma da sala?',
      description: `${cell.nomeProprio} deixará de ocupar ${row.nome} no turno da ${NOME_TURNO[cell.turno]}.`,
      confirmLabel: 'Liberar',
      danger: true,
    });
    if (ok) this.salasService.liberarTurno(sala, cell.turno);
  }

  async vincular(row: TurmaRow, cell: TurmaCell, codTurma: string): Promise<void> {
    if (!codTurma) return;
    const sala = this.salasService.sala(row.id);
    if (!sala) return;

    const livre = cell.turmasLivres.find((t) => t.codTurma === codTurma);
    if (livre) {
      this.salasService.vincularTurno(sala, cell.turno, livre);
      return;
    }

    const emOutraSala = cell.turmasEmOutraSala.find((t) => t.codTurma === codTurma);
    if (!emOutraSala) return;
    const ok = await this.confirmDialog.confirm({
      title: 'Mover turma para esta sala?',
      description:
        `${emOutraSala.nome} sai de ${emOutraSala.salaAtual} e passa a ocupar ${row.nome} ` +
        `no turno da ${NOME_TURNO[cell.turno]}. ${emOutraSala.salaAtual} fica livre nesse turno.`,
      confirmLabel: 'Mover',
    });
    if (ok) {
      this.salasService.vincularTurno(sala, cell.turno, emOutraSala, emOutraSala.salaAtual);
    } else {
      this.versaoSelecao.update((v) => v + 1);
    }
  }
}
