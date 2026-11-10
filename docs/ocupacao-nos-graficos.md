# Ocupação nos gráficos — como é calculada hoje

Levantamento de 05/11/2026 (tarefa 3). Descreve o cálculo como está no código.

**Atualização de 09/11/2026** (reforma do Mapa de Ocupação): a regra de cálculo **não mudou**. Mudou o
que a tela mostra:
- abas **Tabela**, **Gráfico** e **Comparar anos**; a aba Evolução, com números inventados, saiu;
- as cores do Mapa passaram a usar as **faixas das Regras de ocupação** (Disponível / Quase lotada /
  Excedida), como no Painel e na Planta, sempre com ícone e rótulo junto da cor;
- a tela explica a regra em "Como a ocupação é calculada", embaixo do card.

O cálculo está em `src/app/features/ocupacao/ocupacao-calculo.ts` (com testes em `ocupacao-calculo.spec.ts`).

## De onde vêm os números

| Dado | Origem | Observação |
|---|---|---|
| **Alunos** de uma turma | `OCUPACAO` da consulta `API.OC.SAL.TURMA` ("OCUPAÇÃO DE SALAS - TURMAS"). Em sala com mais de uma turma, a `COMPOSICAO` de `API.OC.SAL.TURSA` ("EF3A-I (2) + EF3A-M (21)") | É o número de alunos da turma. **Quais situações de matrícula entram está no SQL da consulta**, que não está no repositório e que a API do RM não devolve: confirmar no RM. |
| **Capacidade** da sala | `CAPACIDADE` de `API.OC.SAL.PERIO`, que lê a MD Salas por Período Letivo (PRJ4087040), um registro por sala e ano | Número cadastrado. O app não calcula pela área. |
| **Carteiras** da sala | `CARTEIRAS` do mesmo registro | As carteiras físicas, que a Planta transfere. |
| Capacidade máxima | `CAPACIDADEMAXIMA` do mesmo registro | Vem na consulta, mas o app não usa. |
| Regra da unidade | MD Regras de Ocupação (PRJ6016768) | Só o **% máximo de utilização** e o **Permitir exceder** entram em contas. A **área por pessoa não é usada em nenhum cálculo**. |

## O cálculo em cada tela

| Tela | Alunos (numerador) | Base (denominador) | Cores |
|---|---|---|---|
| **Painel**, chips por unidade | Por sala, os alunos do turno mais cheio (ou do turno filtrado); somados na unidade | Capacidade de **todas** as salas da unidade, inclusive as vazias | Só o número |
| **Painel**, status de cada sala | Alunos do turno da sala | Capacidade da sala | Quase lotada a partir do **% máximo da regra**; Excedida acima de 100% |
| **Planta** | Alunos do turno da sala | **Carteiras** da sala | Mesmas faixas do Painel. O limite de carteiras é capacidade × % máximo |
| **Mapa → Tabela e Gráfico** | Soma dos alunos das turmas: manhã **+** tarde em "Todos os turnos" | Capacidade **só das salas com turma**, contada uma vez por turno que tem turma. Sala dividida entre turmas rateia a capacidade pela proporção de alunos | Faixas da regra (desde 09/11). O limite de um grupo é a soma de capacidade × % máximo de cada unidade, então um grupo com unidades de regras diferentes usa a média ponderada |
| **Mapa → Comparar anos** | O mesmo cálculo, para cada ano letivo escolhido (dados reais do RM, um ano de cada vez) | Idem | Idem. A variação é em pontos percentuais entre os dois anos mais recentes com turmas |

### A aba Evolução não usava dados reais (removida em 09/11/2026)

Os alunos de cada mês saem de um gerador pseudoaleatório (`mulberry32`), com semente "unidades + ano":
- uma rampa de 76–84% da capacidade, somada a um ruído;
- um "aumento de capacidade" sorteado entre julho e setembro.

Só a capacidade base é real (a soma das salas). O RM não guarda histórico mensal de ocupação, então hoje **não existe dado para essa aba**. O que aparece nela parece real, mas não é.

## Exemplo: a mesma unidade com dois números

Unidade com duas salas de capacidade 30. Sala A: 25 alunos de manhã e 20 à tarde. Sala B: sem turma.

| Filtro | Painel | Mapa |
|---|---|---|
| Todos os turnos | 25 ÷ 60 = **42%** | (25 + 20) ÷ (30 + 30) = **75%** |
| Manhã | 25 ÷ 60 = **42%** | 25 ÷ 30 = **83%** |

As diferenças:
- O Mapa ignora salas vazias (capacidade ociosa).
- Em "Todos os turnos", o Mapa soma os dois turnos, e o Painel pega o turno mais cheio de cada sala.

## Pontos para alinhar

1. ~~**Evolução**~~: **decidido em 09/11**, trocada por **Comparar anos** com dados reais.
2. **Base da ocupação de uma unidade**, igual no Painel e no Mapa:
   - turnos de todas as salas: alunos ÷ (capacidade × turnos);
   - turno mais cheio (o Painel hoje);
   - só salas com turma (o Mapa hoje).
3. **Denominador**: capacidade cadastrada, carteiras físicas ou limite da regra (capacidade × % máximo).
4. ~~**Cores**~~: **decidido em 09/11**, o Mapa usa as faixas da regra.

Os itens 2, 3, 5 e 6 seguem em aberto: em 09/11 ficou decidido manter a regra atual até o alinhamento com a área.
5. **Área por pessoa** (Regras): hoje não muda nada. Usar para calcular a capacidade pela área, ou tirar do formulário.
6. **Tipos de sala**: laboratórios e outras salas sem turma entram no denominador do Painel. Decidir se só "Sala de aula" conta.
