# ADR 0007 — Contexto Members e vínculos congregacionais

- Status: Proposed (implementado provisoriamente para o MVP; aguarda aprovação)
- Data: 2026-10-19

## Contexto

Com Organization disponível (ADR 0006), o MVP precisa do cadastro de membros e dos seus vínculos
com as congregações. O CLAUDE.md já aprova o desenho geral: Member e Membership são Aggregates
separados, PersonProfile pertence a Member, Member tem as situações ACTIVE, INACTIVE e ARCHIVED,
Membership tem PENDING, ACTIVE e INACTIVE, há no máximo um vínculo congregacional principal ativo e
o histórico é preservado. Faltava decidir os dados pessoais do MVP, as transições, a forma de ler
congregações de outro contexto e as garantias de concorrência.

## Decisão

- **Members na Core API** (`apps/core-api/src/modules/members`), com schema PostgreSQL próprio
  `members` e a migration `0002_membros`, aplicada pela Core API ao iniciar.
- **PersonProfile mínimo**: nome completo (obrigatório), data de nascimento, telefone e e-mail
  (opcionais). Sem documentos (CPF/RG), endereço ou dados sensíveis enquanto não houver
  autorização por campo.
- **Member**: nasce ACTIVE; `deactivate` (ACTIVE → INACTIVE), `activate` (INACTIVE → ACTIVE),
  `archive` (INACTIVE → ARCHIVED) e `restore` (ARCHIVED → INACTIVE). Membro arquivado não pode ter o
  perfil alterado. Inativar ou arquivar exige que não haja vínculo PENDING ou ACTIVE.
- **Membership**: nasce PENDING; `activate` (PENDING → ACTIVE, grava `startedOn`) e `deactivate`
  (PENDING | ACTIVE → INACTIVE, grava `endedOn`). Vínculo encerrado é histórico: não é reaberto
  nem apagado; um novo vínculo é registrado quando o membro volta. Registrar e ativar exigem membro
  e congregação ACTIVE; encerrar é sempre permitido.
- **Invariantes no banco** (índices únicos parciais): um vínculo aberto (PENDING ou ACTIVE) por
  membro e congregação, e no máximo um vínculo principal ACTIVE por membro. A regra vale mesmo com
  requisições simultâneas.
- **Leitura entre contextos**: Organization expõe o contrato público `CongregationDirectory` em
  `modules/organization/public/` (via `OrganizationPublicModule`). Members o consome por uma
  Anticorruption Layer (`CongregationCatalog`). Não há chave estrangeira entre schemas: o vínculo
  guarda somente o ID estável da congregação.
- **Datas civis** (`startedOn`, `endedOn`, validação da data de nascimento) no fuso
  `America/Campo_Grande`, por meio da porta `Clock`.
- **Shared Kernel**: `EmailAddress` e `PhoneNumber` passam para `src/shared/domain/value-objects`,
  usados por Organization e Members. `parseOrThrow` passa para `src/shared/presentation`.
- **BFF**: rotas `/api/v1/members` e `/api/v1/memberships`, com as mesmas regras do ADR 0006
  (sessão com e-mail verificado e CSRF nas alterações). O encaminhamento à Core API passa a ficar no
  `CoreApiModule`, compartilhado pelos módulos de rotas de negócio.

## Justificativa

Entrega o cadastro de membros sem antecipar decisões pendentes (autorização, vínculo entre conta e
membro), mantendo a posse dos dados por contexto e as regras críticas garantidas no banco.

## Consequências

- Como no ADR 0006, qualquer conta com e-mail verificado lê e altera membros. Dados pessoais exigem
  o contexto Authorization (inclusive autorização por campo) antes de produção.
- Inativar uma congregação não encerra os vínculos existentes; eles continuam abertos e não podem
  ser ativados enquanto a congregação estiver inativa. A consistência forte entre inativação de
  congregação e registro de vínculo continua uma decisão pendente.
- Um vínculo pode referenciar uma congregação removida do catálogo; a API devolve
  `congregation: null` nesse caso (hoje congregações não são excluídas).
- O vínculo entre conta digital (Identity) e membro fica para depois.

## Alternativas consideradas

- Situação do vínculo derivada da situação do membro: descartada; o encerramento explícito
  preserva datas e histórico.
- Chave estrangeira de `memberships.congregation_id` para `organization.congregations`: descartada,
  pois acoplaria os schemas dos contextos.
- Validação do vínculo principal somente na Application: insuficiente sob concorrência; o índice
  parcial do banco é a garantia final.
