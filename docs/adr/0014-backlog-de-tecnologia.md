# ADR 0014 — Backlog de solicitações do departamento de Tecnologia

- Status: Proposed (implementado; aguarda aprovação)
- Data: 2026-11-09

## Contexto

Os membros precisam registrar pedidos de funcionalidades, erros e ajustes para o departamento de
Tecnologia, que dá andamento a eles em um quadro no estilo kanban. Isso não pertence a nenhum dos
contextos existentes: não é comunicação, formulário nem cadastro institucional.

## Decisão

- Novo contexto **Backlog** em `apps/core-api/src/modules/backlog`, com o schema PostgreSQL próprio
  `backlog` e o Aggregate `BacklogCard`.
- Etapas, nessa ordem: `CREATED`, `PRIORITIZED`, `REFINED`, `IN_PROGRESS`, `TESTING`, `HOMOLOGATED`,
  `DONE`, `DEPLOYED`. Tipos: `FEATURE`, `BUG`, `ADJUSTMENT`.
- Título e descrição são obrigatórios.
- O card nasce em `CREATED` ou na etapa da coluna em que foi adicionado e pode ir para qualquer outra etapa, avançando ou voltando. A ordem das
  etapas é o caminho esperado e a ordem das colunas, mas o sistema não a impõe.
- As datas são definidas pelo Domain: `createdAt` na criação, `updatedAt` a cada mudança real no
  card (inclusive de etapa) e `statusChangedAt` só quando a etapa muda.
- Edição e movimentação usam controle otimista por `version`.
- Regra de acesso provisória do MVP: sessão válida com e-mail verificado, como as demais rotas de
  negócio. Hoje qualquer conta nessas condições pode criar, editar, mover e excluir qualquer card.

## Contrato

| Rota (BFF, sob `/api/v1`)      | Corpo                                     | Efeito                  |
| ------------------------------ | ----------------------------------------- | ----------------------- |
| `GET backlog-cards`            | —                                         | todos os cards          |
| `POST backlog-cards`           | `title`, `description`, `type`, `status`? | cria (padrão `CREATED`) |
| `PUT backlog-cards/:id`        | `title`, `description`, `type`, `version` | altera os dados         |
| `PUT backlog-cards/:id/status` | `status`, `version`                       | move para outra etapa   |
| `DELETE backlog-cards/:id`     | —                                         | exclui definitivamente  |

A listagem não tem paginação porque o quadro mostra todas as etapas de uma vez.

## Consequências

- Separar quem solicita de quem dá andamento exigirá as permissões futuras; até lá, o quadro é
  aberto a todas as contas verificadas com acesso ao menu.
- O card não guarda quem o criou. Incluir o autor exige propagar a conta da sessão à Core API.
- Com o acúmulo de cards implantados, a listagem completa pode precisar de arquivamento ou filtro.
