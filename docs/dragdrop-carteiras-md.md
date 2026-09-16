# MD — Arrastar e mover carteiras entre salas (drag-and-drop)

## 1. O que o recurso faz

O coordenador arrasta uma carteira **vaga** (não ocupada por aluno) da grade da sala
atual e solta sobre outra sala na lista "Outras salas da unidade". Isso transfere 1
carteira fisicamente: a capacidade (`CAPACIDADE`) da sala de origem diminui em 1 e a
da sala de destino aumenta em 1. A soma total de carteiras do prédio/unidade não
muda — é uma redistribuição, não uma criação de carteiras novas.

Não envolve aluno nenhum: não move matrícula, não troca turma. É só capacidade física
disponível para vagas futuras.

## 2. Por que precisa de endpoint novo

Hoje `CAPACIDADE` (o campo que o frontend usa como "quantidade de carteiras" — ver
[ocupacao-adapter.ts:70](../src/app/core/mock/ocupacao-adapter.ts#L70)) só é lido via
`OC_SAL_SALAS`. Não existe nenhum endpoint de gravação para esse campo — a única
mutação hoje é `SalasService.adicionarCarteiras()`
([salas.service.ts:237](../src/app/core/services/salas.service.ts#L237)), que **só
altera o signal em memória**, sem chamar a API. Ela é usada quando uma solicitação de
novas carteiras é aprovada em `SolicitacoesService.aprovar()`
([solicitacoes.service.ts:46](../src/app/core/services/solicitacoes.service.ts#L46)),
mas essa tela inteira ainda roda sobre dados mockados
(`gerarSolicitacoes`), então isso nunca foi persistido de verdade.

Para o drag-and-drop funcionar de forma real (sobrevive a reload, é visto por outro
coordenador, reflete no TOTVS), é preciso um endpoint que grave a mudança de
capacidade nas duas salas.

## 3. Novo endpoint de gravação — `OC_SAL_CARTEIRA_TRANSFERIR`

Move N carteiras de uma sala para outra, decrementando a origem e incrementando o
destino atomicamente (as duas mudanças têm que ser tudo-ou-nada: se falhar no meio,
não pode sobrar carteira "perdida" que não existe em nenhuma das duas salas).

**Request:**
```json
{
  "CODUSUARIO": "bruno.santos",
  "CODFILIALORIGEM": "16",
  "CODBLOCOORIGEM": "01",
  "CODPREDIOORIGEM": "01",
  "CODSALAORIGEM": "12",
  "CODFILIALDESTINO": "16",
  "CODBLOCODESTINO": "01",
  "CODPREDIODESTINO": "01",
  "CODSALADESTINO": "14",
  "QUANTIDADE": 1
}
```

- `QUANTIDADE`: sempre `1` no drag-and-drop de uma carteira por vez, mas o campo
  aceita mais para reaproveitar o mesmo endpoint no fluxo de aprovar solicitações
  (que hoje é só local/mock) caso façam sentido unificar depois.
- Sala origem e destino podem ser de filiais diferentes (mover entre unidades)? Ver
  pergunta em aberto na seção 6 — se não puder, o backend valida e recusa.

**Response:**
```json
{ "sucesso": 1 }
```
(mesmo padrão de `OC_SAL_TURMASXSALAS_SALVAR`: `sucesso: 1` ou `0`, sem mensagem de
erro detalhada — o frontend já trata esse padrão hoje com um toast genérico.)

## 4. Regras de negócio que o backend precisa validar (não só o frontend)

- **Só carteira vaga pode ser movida**: recusar (`sucesso: 0`) se a sala de origem
  não tiver carteira sobrando, isto é, se `CAPACIDADE` já está `<=` à ocupação atual
  (maior valor entre manhã e tarde). O frontend já vai bloquear visualmente antes de
  soltar (arrastar só é permitido a partir de um ícone `kind: 'vaga'` na grade, nunca
  `kind: 'aluno'`), mas a validação de servidor evita que dois coordenadores
  movendo ao mesmo tempo deixem a sala "Excedida".
- **Não deixar `CAPACIDADE` negativa**: nunca recusar tirando mais carteiras do que
  a sala origem tem no total.
- **Auditoria**: quem moveu, quando, de qual sala pra qual — relevante porque afeta
  a capacidade oficial reportada para o Corpo de Bombeiros (ver regras de ocupação/
  IT 11 já implementadas na tela "Regras de ocupação").

## 5. Impacto no frontend (depois que o endpoint acima existir)

- `SalasService` ganha `transferirCarteira(origem: Sala, destino: Sala, quantidade = 1)`,
  análogo a `vincularTurno`/`liberarTurno`: chama `OC_SAL_CARTEIRA_TRANSFERIR` e, no
  sucesso, recarrega (`carregar()`) para refletir a nova capacidade nas duas salas —
  mesmo padrão já usado nas outras mutações desta tela.
- `adicionarCarteiras()` (mutação local, hoje usada só por Solicitações-mock) deixa
  de ser a única forma de alterar carteiras; drag-and-drop usa o novo método
  persistente.
- Tela Planta ([planta.component.html](../src/app/features/planta/planta.component.html)):
  cada `.planta-desk` com `kind === 'vaga'` vira `draggable="true"`; carteiras
  `kind === 'aluno'` ou `kind === 'excedente'` **não** são arrastáveis. A lista
  "Outras salas da unidade" (já existente) vira zona de drop — soltar sobre uma sala
  dispara `transferirCarteira`.
- Feedback visual durante o arraste: destacar as linhas de "Outras salas" que podem
  receber (todas, já que adicionar carteira não tem limite superior) vs. desabilitar
  visualmente a própria sala de origem como alvo de si mesma.
- Bloqueio de modo somente-leitura (`UiModeService.readOnlyMode()`, já usado em
  Regras/Solicitações) reaproveitado aqui: sem permissão de editor, carteiras não
  ficam arrastáveis.
- Toast de sucesso/erro e atualização automática da ocupação são consequência
  natural de chamar `carregar()` depois do `transferirCarteira` — mesmo mecanismo
  que já existe para `vincularTurno`/`liberarTurno`, sem precisar de lógica nova de
  recálculo no frontend.

## 6. Perguntas em aberto para o backend antes de codar o endpoint

1. Mover carteira entre salas de **filiais diferentes** é um caso real (ex: duas
   unidades no mesmo prédio físico) ou a transferência deve ser restrita à mesma
   filial? Isso muda se `CODFILIALDESTINO` precisa de validação extra.
2. O campo certo a gravar é mesmo `CAPACIDADE` (o que o frontend já usa hoje) ou
   existe alguma diferença entre `CAPACIDADE` e `CAPACIDADEMAXIMA` que importa aqui
   — por exemplo, será que também precisa ajustar `CAPACIDADEMAXIMA` junto?
3. Precisa de transação atômica de verdade no banco (origem -1 / destino +1 em uma
   única operação) ou duas chamadas separadas são aceitáveis com o frontend
   tratando falha parcial (ex: origem já descontada mas destino falhou)?
4. Quem pode mover: só coordenador (`UiModeService.editorMode()` já cobre isso) ou
   precisa de trava adicional por unidade/filial (ex: só pode mexer nas salas da
   própria unidade)?
