import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import {
  SaeaAlertComponent,
  SaeaButtonComponent,
  SaeaCheckboxComponent,
  SaeaDialogComponent,
  SaeaDialogFooterDirective,
  SaeaInputComponent,
  SaeaSelectComponent,
  SaeaSelectOption,
  SaeaSkeletonComponent,
} from '@sistemas-saea/saea-design-system';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { juntarFiliais, nomesDasUnidades } from '../../../core/mock/ocupacao-adapter';
import { nomeDoAndar } from '../../../core/models';
import {
  ApiSalaCadastradaDto,
  ApiSalaCriadaDto,
  ApiSalaNovaLocalDto,
  ApiSalaNovaOpcoesDto,
  ApiSalaNovaUnidadeDto,
  ApiSalaPreCriadaDto,
  SalaNovaPedido,
} from '../../../core/models/ocupacao-api.model';
import { OcupacaoApiService } from '../../../core/services/ocupacao-api.service';
import { RegrasService } from '../../../core/services/regras.service';
import { motivoDaFalha, SalasService } from '../../../core/services/salas.service';
import { ToastService } from '../../../core/services/toast.service';

/** Os mesmos limites do backend (SalaNovaService). */
const FORMATO_DO_CODIGO = /^[A-Z0-9]{1,10}$/;
const MAXIMO_DO_NOME = 40;
const MAXIMO_DE_LUGARES = 500;
const ANDARES = ['T', '1', '2', '3', '4', '5', '6'];
const COMPARADOR = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

export type CampoDaSala = 'local' | 'codigo' | 'nome' | 'andar' | 'tipo' | 'area' | 'capacidade' | 'carteiras' | 'anos';

/** Uma unidade na escolha: o nome das telas ("CASJ 1"), o do RM e quantas salas ela já tem. */
export interface UnidadeParaEscolher {
  codFilial: number;
  nome: string;
  nomeNoRm: string;
  salas: number;
  anos: string[];
}

/** Uma sala pré-criada na escolha: o nome e as duas linhas de apoio. */
export interface PreCriadaParaEscolher {
  chave: string;
  sala: ApiSalaPreCriadaDto;
  nome: string;
  detalhe: string;
  anos: string;
  /** O andar é obrigatório e vem do cadastro do RM: sem ele, a sala não pode ser incluída. */
  semAndar: boolean;
}

/** "01" e "1" são o mesmo prédio ou bloco: o RM escreve dos dois jeitos. */
const semZeros = (codigo: string) => codigo.trim().replace(/^0+/, '') || '0';
const chaveDoLocal = (l: Pick<ApiSalaNovaLocalDto, 'codPredio' | 'codBloco'>) => `${semZeros(l.codPredio)}|${semZeros(l.codBloco)}`;

/** O próximo número depois do maior código só com números ("44" → "45"); sem nenhum, vazio. */
export function sugerirCodigo(salas: readonly Pick<ApiSalaCadastradaDto, 'codSala'>[]): string {
  const numeros = salas.map((s) => s.codSala.trim()).filter((c) => /^\d+$/.test(c)).map(Number);
  return numeros.length ? String(Math.max(...numeros) + 1) : '';
}

/** Número da tela, com vírgula ou ponto ("48,5"); vazio = null, e o que não é número = NaN. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (!limpo) return null;
  return /^\d+(\.\d+)?$/.test(limpo) ? Number(limpo) : NaN;
}

/** Capacidade pela área e pela regra da unidade (m² por aluno), arredondada como as salas do RM (48,95 m² → 33). */
export function capacidadePelaArea(area: number | null, areaPorAluno: number): number | null {
  if (area === null || !Number.isFinite(area) || area <= 0 || !(areaPorAluno > 0)) return null;
  return Math.max(1, Math.round(area / areaPorAluno));
}

const inteiroEntre = (texto: string, minimo: number, maximo: number): number | null => {
  const n = lerNumero(texto);
  return n !== null && Number.isInteger(n) && n >= minimo && n <= maximo ? n : null;
};

/**
 * Nova sala (tela Salas por ano): a pessoa escolhe a unidade e preenche a sala; ela vai para o
 * cadastro de salas do RM, que vale para todos os anos, e para os anos letivos marcados (o registro
 * de carteiras e capacidade, o mesmo da cópia). Sugere o código (o próximo número da unidade), o
 * nome ("SALA 45"), a capacidade pela área e a regra da unidade e as carteiras iguais à capacidade;
 * tudo pode ser trocado. As opções vêm do RM a cada vez que abre, para o código nunca se repetir.
 *
 * Se a unidade tem salas pré-criadas (do pedagógico, no cadastro, mas fora de algum ano), a pessoa
 * escolhe uma delas ou uma sala nova. Na pré-criada o modal só tem capacidade, carteiras e anos
 * (código, nome, andar, tipo e área são do cadastro e não aparecem; o nome vai no título): os
 * números vêm do ano mais recente em que ela já está (ou do cadastro) e podem ser trocados, e os
 * anos são só os que faltam. Nada é criado no cadastro: ela só entra nos anos marcados.
 */
@Component({
  selector: 'app-nova-sala',
  standalone: true,
  imports: [
    SaeaAlertComponent,
    SaeaButtonComponent,
    SaeaCheckboxComponent,
    SaeaDialogComponent,
    SaeaDialogFooterDirective,
    SaeaInputComponent,
    SaeaSelectComponent,
    SaeaSkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './nova-sala.component.html',
  styleUrl: './nova-sala.component.css',
})
export class NovaSalaComponent {
  private readonly api = inject(OcupacaoApiService);
  private readonly auth = inject(AuthService);
  private readonly regras = inject(RegrasService);
  private readonly salasService = inject(SalasService);
  private readonly toast = inject(ToastService);

  readonly open = model(false);
  /** O ano para onde a tela copia: vem marcado quando a unidade o tem. */
  readonly anoSugerido = input('');
  readonly criada = output<ApiSalaCriadaDto>();

  readonly opcoes = signal<ApiSalaNovaOpcoesDto | null>(null);
  readonly lendo = signal(false);
  readonly erroLeitura = signal<string | null>(null);

  readonly codFilial = signal<number | null>(null);
  /** Unidade com salas pré-criadas: antes do formulário, a pessoa escolhe uma delas ou uma sala nova. */
  readonly escolhendoSala = signal(false);
  /** A pré-criada escolhida; null = sala nova. */
  readonly preCriada = signal<ApiSalaPreCriadaDto | null>(null);
  readonly local = signal('');
  readonly codigo = signal('');
  private readonly nomeDigitado = signal<string | null>(null);
  readonly andar = signal<string | null>(null);
  readonly tipo = signal<string | null>(null);
  readonly area = signal('');
  private readonly capacidadeDigitada = signal<string | null>(null);
  private readonly carteirasDigitadas = signal<string | null>(null);
  readonly anos = signal<ReadonlySet<string>>(new Set());
  readonly mostrarErros = signal(false);
  readonly criando = signal(false);
  readonly erroDoRm = signal<string | null>(null);
  /** Muda a cada abertura: opções que chegam depois de fechar e abrir de novo são descartadas. */
  private leitura = 0;

  constructor() {
    // Cada abertura começa do zero e lê as opções do RM de novo (as salas da unidade podem ter mudado).
    effect(() => {
      if (this.open()) untracked(() => void this.abrir());
    });
  }

  private readonly nomes = computed(() => {
    const doRm = new Map((this.opcoes()?.unidades ?? []).map((u) => [u.codFilial, u.unidade] as const));
    return nomesDasUnidades(juntarFiliais(doRm, this.salasService.filiais()));
  });

  readonly unidades = computed<UnidadeParaEscolher[]>(() =>
    (this.opcoes()?.unidades ?? [])
      .map((u) => ({
        codFilial: u.codFilial,
        nome: this.nomes().get(u.codFilial) ?? u.unidade,
        nomeNoRm: u.unidade,
        salas: u.salas.length,
        anos: u.anos,
      }))
      .sort((a, b) => COMPARADOR.compare(a.nome, b.nome)),
  );

  readonly unidade = computed<ApiSalaNovaUnidadeDto | null>(
    () => this.opcoes()?.unidades.find((u) => u.codFilial === this.codFilial()) ?? null,
  );
  readonly nomeDaUnidade = computed(() => {
    const u = this.unidade();
    return u ? (this.nomes().get(u.codFilial) ?? u.unidade) : '';
  });

  readonly localOptions = computed<SaeaSelectOption[]>(() =>
    (this.unidade()?.locais ?? []).map((l) => ({ value: chaveDoLocal(l), label: `${l.predio} · ${l.bloco}` })),
  );
  private readonly localEscolhido = computed(
    () => this.unidade()?.locais.find((l) => chaveDoLocal(l) === this.local()) ?? null,
  );
  /** As salas do prédio e bloco escolhidos: é onde o código não pode se repetir. */
  private readonly salasDoLocal = computed(() => {
    const local = this.local();
    return (this.unidade()?.salas ?? []).filter((s) => chaveDoLocal(s) === local);
  });

  /** As pré-criadas da unidade, na ordem do nome ("SALA 2" antes de "SALA 10"). */
  readonly preCriadas = computed<PreCriadaParaEscolher[]>(() =>
    (this.unidade()?.preCriadas ?? [])
      .map((s) => ({
        chave: `${chaveDoLocal(s)}|${s.codSala}`,
        sala: s,
        nome: s.sala || `Sala ${s.codSala}`,
        detalhe: [s.tipoSala, s.andar ? nomeDoAndar(s.andar) : '', `código ${s.codSala}`].filter(Boolean).join(' · '),
        anos: `Falta em ${s.faltam.join(', ')}` + (s.jaEsta.length ? ` · já está em ${s.jaEsta.join(', ')}` : ''),
        semAndar: !s.andar.trim(),
      }))
      .sort((a, b) => COMPARADOR.compare(a.nome, b.nome)),
  );

  /** Sala já cadastrada no RM (pré-criada): o modal só mostra capacidade, carteiras e anos. */
  readonly doCadastro = computed(() => this.preCriada() !== null);
  /** Pré-criada sem andar no cadastro do RM: o andar é obrigatório, então ela não pode ser incluída. */
  readonly semAndarNoCadastro = computed(() => {
    const pre = this.preCriada();
    return pre !== null && !pre.andar.trim();
  });
  /** Os anos para marcar: na pré-criada, só os que faltam. */
  readonly anosParaMarcar = computed(() => this.preCriada()?.faltam ?? this.unidade()?.anos ?? []);

  readonly andarOptions: SaeaSelectOption[] = ANDARES.map((a) => ({ value: a, label: nomeDoAndar(a) }));
  readonly tipoOptions = computed<SaeaSelectOption[]>(() =>
    (this.opcoes()?.tipos ?? []).map((t) => ({ value: String(t.codTipoSala), label: t.nome })),
  );

  readonly areaPorAluno = computed(() => {
    const f = this.codFilial();
    return f === null ? 0 : this.regras.regrasDaFilial(f).areaPorAluno;
  });
  readonly textoAreaPorAluno = computed(() => this.areaPorAluno().toLocaleString('pt-BR'));

  /** O que os campos mostram: o que a pessoa digitou ou, enquanto não digitou, a sugestão. */
  readonly nome = computed(() => this.nomeDigitado() ?? (this.codigo().trim() ? `SALA ${this.codigo().trim().toUpperCase()}` : ''));
  readonly capacidadeSugerida = computed(() => capacidadePelaArea(lerNumero(this.area()), this.areaPorAluno()));
  readonly capacidade = computed(() => this.capacidadeDigitada() ?? (this.capacidadeSugerida()?.toString() ?? ''));
  readonly carteiras = computed(() => this.carteirasDigitadas() ?? this.capacidade());

  /** De onde vieram os números da pré-criada: "Como em 2027" ou "Do cadastro do RM". */
  private readonly origemDosNumeros = computed(() => {
    const ano = this.preCriada()?.anoDosNumeros;
    return ano ? `Como em ${ano}` : 'Do cadastro do RM';
  });
  readonly ajudaCapacidade = computed(() => {
    const pre = this.preCriada();
    if (pre?.capacidade != null) return this.origemDosNumeros();
    if (pre) {
      // A área não aparece no modal da pré-criada: o texto diz qual é.
      return this.capacidadeSugerida() !== null
        ? `Pela área do cadastro (${this.area()} m²) e a regra da unidade`
        : 'O RM não tem a capacidade nem a área desta sala';
    }
    return this.capacidadeSugerida() !== null
      ? `Pela área: ${this.textoAreaPorAluno()} m² por aluno (regra da unidade)`
      : 'Com a área, sai pela regra da unidade';
  });
  readonly ajudaCarteiras = computed(() =>
    this.preCriada()?.carteiras != null ? this.origemDosNumeros() : 'Começa igual à capacidade',
  );

  readonly erros = computed<Partial<Record<CampoDaSala, string>>>(() => {
    const erros: Partial<Record<CampoDaSala, string>> = {};
    const unidade = this.unidade();
    if (!unidade) return erros;
    if (this.preCriada()) {
      // Os campos do cadastro não aparecem: só os do ano são da pessoa. O andar tem de vir do RM.
      if (this.semAndarNoCadastro()) erros.andar = 'A sala não tem andar no cadastro do RM.';
      if (inteiroEntre(this.capacidade(), 1, MAXIMO_DE_LUGARES) === null) erros.capacidade = `De 1 a ${MAXIMO_DE_LUGARES} lugares.`;
      if (inteiroEntre(this.carteiras(), 0, MAXIMO_DE_LUGARES) === null) erros.carteiras = `De 0 a ${MAXIMO_DE_LUGARES}.`;
      if (this.anos().size === 0) erros.anos = 'Marque pelo menos um ano.';
      return erros;
    }
    if (!this.localEscolhido()) erros.local = unidade.locais.length ? 'Escolha o prédio e o bloco.' : 'A unidade não tem prédio e bloco no RM.';
    const codigo = this.codigo().trim().toUpperCase();
    const repetida = this.salasDoLocal().find((s) => s.codSala.trim().toUpperCase() === codigo);
    if (!codigo) erros.codigo = 'Informe o código.';
    else if (!FORMATO_DO_CODIGO.test(codigo)) erros.codigo = 'Só letras e números, até 10.';
    else if (repetida) erros.codigo = `Já existe: ${repetida.sala || `a sala ${repetida.codSala}`} usa esse código.`;
    const nome = this.nome().trim();
    if (!nome) erros.nome = 'Informe o nome.';
    else if (nome.length > MAXIMO_DO_NOME) erros.nome = `Até ${MAXIMO_DO_NOME} letras.`;
    if (!this.andar()) erros.andar = 'Escolha o andar.';
    if (!this.tipo()) erros.tipo = 'Escolha o tipo.';
    const area = lerNumero(this.area());
    if (area !== null && !(area > 0)) erros.area = 'Em m², maior que zero (ex.: 48,5).';
    if (inteiroEntre(this.capacidade(), 1, MAXIMO_DE_LUGARES) === null) erros.capacidade = `De 1 a ${MAXIMO_DE_LUGARES} lugares.`;
    if (inteiroEntre(this.carteiras(), 0, MAXIMO_DE_LUGARES) === null) erros.carteiras = `De 0 a ${MAXIMO_DE_LUGARES}.`;
    if (this.anos().size === 0) erros.anos = 'Marque pelo menos um ano.';
    return erros;
  });

  /** O erro aparece depois do primeiro Criar; o código repetido, na hora. */
  erroDe(campo: CampoDaSala): string | null {
    const erro = this.erros()[campo] ?? null;
    return this.mostrarErros() || (campo === 'codigo' && erro?.startsWith('Já existe')) ? erro : null;
  }

  readonly titulo = computed(() => {
    const pre = this.preCriada();
    if (pre) return `${pre.sala || `Sala ${pre.codSala}`} na ${this.nomeDaUnidade()}`;
    return this.unidade() ? `Nova sala na ${this.nomeDaUnidade()}` : 'Nova sala';
  });

  escolherUnidade(codFilial: number): void {
    const unidade = this.opcoes()?.unidades.find((u) => u.codFilial === codFilial);
    if (!unidade) return;
    this.codFilial.set(codFilial);
    this.regras.carregarFiliais([codFilial]);
    this.prepararSalaNova(unidade);
    this.escolhendoSala.set(unidade.preCriadas.length > 0);
  }

  /** Na escolha das salas da unidade: a pré-criada vem preenchida com o que o RM já tem. */
  escolherPreCriada(sala: ApiSalaPreCriadaDto): void {
    const unidade = this.unidade();
    if (!unidade) return;
    this.preCriada.set(sala);
    this.escolhendoSala.set(false);
    this.local.set(chaveDoLocal(sala));
    this.codigo.set(sala.codSala);
    this.nomeDigitado.set(sala.sala);
    this.andar.set(sala.andar || null);
    this.tipo.set(String(sala.codTipoSala));
    this.area.set(sala.area !== null ? String(sala.area).replace('.', ',') : '');
    // Sem capacidade no RM, sai pela área (como na sala nova); sem carteiras, igual à capacidade.
    this.capacidadeDigitada.set(sala.capacidade !== null ? String(sala.capacidade) : null);
    this.carteirasDigitadas.set(sala.carteiras !== null ? String(sala.carteiras) : null);
    this.anos.set(new Set(this.anoInicial(sala.faltam)));
    this.mostrarErros.set(false);
    this.erroDoRm.set(null);
  }

  /** Na escolha das salas da unidade: cadastrar uma sala que o RM ainda não tem. */
  cadastrarNova(): void {
    const unidade = this.unidade();
    if (!unidade) return;
    this.prepararSalaNova(unidade);
    this.escolhendoSala.set(false);
  }

  /** Do formulário de volta para a escolha das salas da unidade. */
  voltarParaSalas(): void {
    this.escolhendoSala.set(true);
    this.erroDoRm.set(null);
  }

  /** O formulário da sala nova com as sugestões: código, nome, sala de aula e o ano da tela. */
  private prepararSalaNova(unidade: ApiSalaNovaUnidadeDto): void {
    this.preCriada.set(null);
    const local = unidade.locais[0];
    this.local.set(local ? chaveDoLocal(local) : '');
    this.codigo.set(sugerirCodigo(local ? unidade.salas.filter((s) => chaveDoLocal(s) === chaveDoLocal(local)) : unidade.salas));
    this.nomeDigitado.set(null);
    this.andar.set(null);
    const tipos = this.opcoes()?.tipos ?? [];
    const deAula = tipos.find((t) => /sala de aula/i.test(t.nome)) ?? tipos[0];
    this.tipo.set(deAula ? String(deAula.codTipoSala) : null);
    this.area.set('');
    this.capacidadeDigitada.set(null);
    this.carteirasDigitadas.set(null);
    this.anos.set(new Set(this.anoInicial(unidade.anos)));
    this.mostrarErros.set(false);
    this.erroDoRm.set(null);
  }

  /** O ano que já vem marcado: o da tela, se está entre os possíveis; senão, o último deles. */
  private anoInicial(possiveis: string[]): string[] {
    const sugerido = this.anoSugerido();
    const ano = possiveis.includes(sugerido) ? sugerido : possiveis.at(-1);
    return ano ? [ano] : [];
  }

  trocarUnidade(): void {
    this.codFilial.set(null);
    this.preCriada.set(null);
    this.escolhendoSala.set(false);
    this.erroDoRm.set(null);
  }

  /** Trocar o prédio ou o bloco troca o código sugerido, se a pessoa ainda não mexeu nele. */
  escolherLocal(valor: string | null): void {
    const sugeridoAntes = sugerirCodigo(this.salasDoLocal());
    this.local.set(valor ?? '');
    if (!this.codigo().trim() || this.codigo().trim() === sugeridoAntes) this.codigo.set(sugerirCodigo(this.salasDoLocal()));
  }

  digitarNome(texto: string): void {
    this.nomeDigitado.set(texto);
  }

  digitarCapacidade(texto: string): void {
    this.capacidadeDigitada.set(texto);
  }

  digitarCarteiras(texto: string): void {
    this.carteirasDigitadas.set(texto);
  }

  marcarAno(ano: string, marcado: boolean): void {
    this.anos.update((atual) => {
      const proximos = new Set(atual);
      if (marcado) proximos.add(ano);
      else proximos.delete(ano);
      return proximos;
    });
  }

  anoMarcado(ano: string): boolean {
    return this.anos().has(ano);
  }

  tentarDeNovo(): void {
    void this.lerOpcoes();
  }

  fechar(): void {
    if (!this.criando()) this.open.set(false);
  }

  async criar(): Promise<void> {
    if (this.criando()) return;
    this.mostrarErros.set(true);
    const unidade = this.unidade();
    const pre = this.preCriada();
    // A pré-criada vai como o RM a tem (prédio, bloco e código do cadastro).
    const local = pre ?? this.localEscolhido();
    if (!unidade || !local || Object.keys(this.erros()).length > 0) return;

    const pedido: SalaNovaPedido = {
      codFilial: unidade.codFilial,
      codPredio: local.codPredio,
      codBloco: local.codBloco,
      codSala: pre ? pre.codSala : this.codigo().trim().toUpperCase(),
      descricao: this.nome().trim(),
      codTipoSala: Number(this.tipo()),
      andar: this.andar() ?? '',
      area: lerNumero(this.area()),
      capacidade: inteiroEntre(this.capacidade(), 1, MAXIMO_DE_LUGARES)!,
      carteiras: inteiroEntre(this.carteiras(), 0, MAXIMO_DE_LUGARES)!,
      anos: [...this.anos()].sort(),
      existente: pre !== null,
    };

    this.criando.set(true);
    this.erroDoRm.set(null);
    try {
      const criada = await firstValueFrom(this.api.criarSala(this.codUsuario(), pedido));
      this.avisar(criada);
      this.criada.emit(criada);
      this.open.set(false);
    } catch (err) {
      // Nada foi gravado (pedido recusado ou o RM não criou a sala): o formulário fica como está.
      this.erroDoRm.set(motivoDaFalha(err));
    } finally {
      this.criando.set(false);
    }
  }

  private avisar(criada: ApiSalaCriadaDto): void {
    const entrou = criada.anos.filter((a) => a.situacao !== 'falhou').map((a) => a.ano);
    const faltou = criada.anos.filter((a) => a.situacao === 'falhou');
    const onde = `${criada.sala} na ${this.nomeDaUnidade()}`;
    const motivos = faltou.map((a) => `${a.ano}: ${a.erro ?? 'o RM não confirmou'}`).join(' · ');
    if (this.preCriada()) {
      // A pré-criada já estava no cadastro: só conta em que anos entrou.
      if (faltou.length === 0) this.toast.success('Sala incluída', `${onde}, em ${entrou.join(' e ')}.`);
      else if (entrou.length) this.toast.warning(`Sala incluída, mas fora de ${faltou.map((a) => a.ano).join(' e ')}`, `${onde} entrou em ${entrou.join(' e ')}. Não entrou em ${motivos}`);
      else this.toast.warning('A sala não entrou em nenhum ano', `${onde}. Não entrou em ${motivos}`);
      return;
    }
    if (faltou.length === 0) {
      this.toast.success('Sala criada', `${onde}, em ${entrou.join(' e ')}.`);
      return;
    }
    this.toast.warning(
      entrou.length ? `Sala criada, mas fora de ${faltou.map((a) => a.ano).join(' e ')}` : 'Sala criada, mas sem ano letivo',
      `${onde} está no cadastro do RM${entrou.length ? ` e em ${entrou.join(' e ')}` : ''}. Não entrou em ${motivos}`,
    );
  }

  private async abrir(): Promise<void> {
    this.codFilial.set(null);
    this.preCriada.set(null);
    this.escolhendoSala.set(false);
    this.erroDoRm.set(null);
    this.mostrarErros.set(false);
    await this.lerOpcoes();
  }

  private async lerOpcoes(): Promise<void> {
    const leitura = ++this.leitura;
    this.lendo.set(true);
    this.erroLeitura.set(null);
    try {
      const opcoes = await firstValueFrom(this.api.getOpcoesSalaNova(this.codUsuario()));
      if (leitura !== this.leitura) return;
      this.opcoes.set(opcoes);
      // Uma unidade só: já vai para o formulário (dá para voltar e ver a escolha).
      if (opcoes.unidades.length === 1) this.escolherUnidade(opcoes.unidades[0].codFilial);
    } catch (err) {
      if (leitura !== this.leitura) return;
      this.opcoes.set(null);
      this.erroLeitura.set(motivoDaFalha(err));
    } finally {
      if (leitura === this.leitura) this.lendo.set(false);
    }
  }

  private codUsuario(): string {
    return this.auth.currentUser()?.username ?? '';
  }
}
