# Domínio Backlog

Implementação: `apps/core-api/src/modules/backlog`.
Decisões: [ADR 0014](../adr/0014-backlog-de-tecnologia.md).

## Linguagem ubíqua

| Termo | Significado                                                                |
| ----- | -------------------------------------------------------------------------- |
| Card  | Solicitação de funcionalidade, erro ou ajuste feita ao time de Tecnologia. |
| Etapa | Coluna do quadro em que o card está; é o status do card.                   |
| Mover | Passar o card para qualquer outra etapa, avançando ou voltando.            |

## Aggregate BacklogCard

- Campos: título (obrigatório, até 120 caracteres), descrição (obrigatória, até 5000), tipo, etapa,
  versão e as datas de criação, alteração e mudança de status.
- Etapas: Criado → Priorizado → Refinado → Em andamento → Testando → Homologado → Concluído →
  Implantado.
- Tipos: Funcionalidade, Erro e Ajuste.
- Editar não muda a etapa; mover é uma operação própria e atualiza as datas de alteração e de
  mudança de status.
- Salvar sem nenhuma mudança não altera a data de alteração.
