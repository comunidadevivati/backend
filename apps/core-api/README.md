# Core API — Comunidade Viva e Eficaz

## 1. Objetivo

A Core API é a aplicação principal do backend, construída com NestJS, Fastify e TypeScript.

Sua arquitetura combina:

- Modular Monolith
- Domain-Driven Design (DDD)
- Clean Architecture
- SOLID
- CQRS seletivo
- Event-Driven Architecture seletiva

Os Bounded Contexts são módulos internos, não microserviços independentes.

## 2. Bounded Contexts iniciais

- Organization: organizações e congregações.
- Identity: identidades digitais, convites e provisionamento.
- Authorization: papéis, permissões, políticas e escopos.
- Members: cadastro de membros e vínculos congregacionais.

Cada contexto possui seu próprio modelo de domínio, contratos e ownership de dados.

## 3. Estrutura de referência

src/
├── modules/
│ ├── organization/
│ │ ├── domain/
│ │ ├── application/
│ │ ├── infrastructure/
│ │ └── presentation/
│ │ └── public/ (contrato para outros contextos)
│ ├── identity/
│ ├── authorization/
│ └── members/
├── shared/
└── main.ts

A estrutura interna será detalhada nos READMEs dos respectivos módulos.

## 4. Domain

Responsável pelas regras centrais de negócio.

Contém:

- Aggregate Roots
- Entities
- Value Objects
- Domain Services
- Domain Events
- Invariantes

Regras:

- Não depender de NestJS, Drizzle, HTTP ou PostgreSQL.
- Não acessar banco de dados diretamente.
- Não importar Application, Infrastructure ou Presentation.
- Não conter DTOs HTTP.
- Proteger invariantes dentro dos Aggregates.

## 5. Application

Responsável por executar os casos de uso.

Contém:

- Commands e Queries
- Use Cases
- Ports
- Contratos de Application
- Transaction Manager
- Coordenação de políticas e autorização

Regras:

- Depender do Domain e de abstrações.
- Não conhecer implementações concretas de persistência.
- Controlar transações por abstrações.
- Aplicar autorização antes das operações protegidas.
- Utilizar Result Pattern para resultados esperados.

## 6. Infrastructure

Responsável pelas implementações técnicas.

Contém:

- Repositories Drizzle
- Query Services concretos
- PostgreSQL
- Adapters externos
- Implementações das Ports
- Persistência de Outbox e Inbox

Regras:

- Implementar contratos definidos nas camadas internas.
- Não conter regras centrais de negócio.
- Não expor modelos Drizzle diretamente ao Domain.
- Respeitar o ownership dos schemas.

## 7. Presentation

Responsável pela entrada e saída das interfaces externas.

Contém:

- Controllers
- DTOs de entrada e saída
- Validação Zod
- Mapeamento de erros
- Contratos de transporte

Regras:

- Não implementar regras de negócio.
- Não acessar repositories diretamente.
- Invocar Use Cases ou Query Services apropriados.
- Não assumir que validação de entrada substitui invariantes do Domain.
- Não confiar em escopos ou identidades fornecidos arbitrariamente pelo cliente.

## 8. Dependências permitidas

Domain:

- Não depende das demais camadas.

Application:

- Pode depender de Domain e contratos internos apropriados.

Infrastructure:

- Implementa Ports e pode depender de Application e Domain.

Presentation:

- Invoca contratos de Application.
- Não importa implementações de Infrastructure.

Composition Root:

- Realiza a montagem das dependências por meio do NestJS.

A direção arquitetural é sempre das camadas externas para as abstrações internas.

## 9. Comunicação entre Bounded Contexts

- Utilizar contratos públicos explícitos.
- Referenciar entidades de outros contextos por IDs.
- Não importar repositories internos de outros módulos.
- Não executar queries arbitrárias em schemas de outros contextos.
- Evitar dependências circulares.
- Utilizar Domain Events locais.
- Publicar Integration Events duráveis somente quando necessários.

## 10. Persistência

- PostgreSQL 18.
- Drizzle ORM.
- Schema PostgreSQL por Bounded Context.
- UUIDv7 para identificadores.
- Migrations versionadas e revisadas.
- Transaction Manager por abstração.
- Controle otimista de concorrência nas operações críticas.
- RLS seletivo como defesa adicional.
- Outbox e Inbox quando aplicáveis.

## 11. Segurança

- Autenticação por e-mail e senha no BFF (ADR 0003); identidade propagada à Core API ainda pendente.
- Credencial de serviço provisória do BFF (`CORE_API_TOKEN`, ADR 0006) em todas as rotas, exceto o
  health check.
- RBAC + ABAC + ReBAC para autorização.
- Deny by default.
- Explicit deny prevalece.
- Escopos Organization, Congregation e Resource.
- Auditoria para operações críticas.
- Proteção de dados pessoais.
- Verificação de permissões na Core API.
- Não confiar exclusivamente na autorização realizada pelo BFF.

## 12. Convenções

- TypeScript strict.
- ESM e NodeNext.
- Exports nomeados por padrão.
- Classes para elementos DDD e integração NestJS.
- Arrow functions para helpers funcionais.
- Contratos públicos explícitos.
- Evitar tipos any.
- Não criar abstrações sem necessidade.
- Evitar módulos ou serviços genéricos que concentrem responsabilidades distintas.

## 13. Testes

- Vitest.
- Testes unitários de Domain.
- Testes de Use Cases.
- Testcontainers para integração com PostgreSQL.
- Testes de contratos.
- Testes arquiteturais.
- Testes de autorização e isolamento entre congregações.

## 14. Observabilidade

- OpenTelemetry.
- Pino.
- Traces distribuídos.
- Métricas e logs estruturados.
- CorrelationId.
- Auditoria independente de logs técnicos.

## 15. Evolução

Novos Bounded Contexts devem iniciar como módulos internos da Core API.

A extração para serviços independentes somente ocorrerá mediante justificativa concreta de escalabilidade, isolamento operacional ou requisitos específicos.

Toda decisão arquitetural relevante deverá ser registrada em docs/adr/.

## 16. Contexto Organization implementado

Organização principal (Matriz) e congregações, descritas em
[docs/domains/organization.md](../../docs/domains/organization.md) e no
[ADR 0006](../../docs/adr/0006-organization-e-integracao-bff-core-api.md).

- Rotas `/api/v1/organization` e `/api/v1/congregations`, exigindo
  `Authorization: Bearer <CORE_API_TOKEN>`; o health check permanece público.
- Erros em RFC 9457 (`application/problem+json`), com `fields` listando somente os campos
  recusados.
- Schema `organization`, migrations em `drizzle/` (`pnpm --dir apps/core-api db:generate`) aplicadas
  ao iniciar; a migration `0001_matriz_e_sede` cria a Matriz e a Sede ativas.
- Local: copie `.env.example` para `.env.local`, use o mesmo `CORE_API_TOKEN` no BFF e rode
  `pnpm dev:api`. Testes de integração com PostgreSQL real: `pnpm --dir apps/core-api test:integration`.

## 16.1 Contexto Members implementado

Pessoas, membros e vínculos congregacionais, descritos em
[docs/domains/members.md](../../docs/domains/members.md) e nos ADRs
[0007](../../docs/adr/0007-members-e-vinculos-congregacionais.md) e
[0009](../../docs/adr/0009-pessoa-e-membro-a-partir-de-conta.md).

- Rotas `/api/v1/members` e `/api/v1/memberships`, com a mesma credencial de serviço.
- Schema `members` (migration `0002_membros`): `people` (uma Pessoa por conta), `members` (um
  membro por Pessoa) e `memberships`, com índices únicos parciais para o vínculo aberto por
  congregação e o vínculo principal ativo.
- `POST /api/v1/members` é chamado somente pelo BFF, na conversão de conta verificada: cria Pessoa
  e membro na mesma transação, de forma idempotente por conta.
- Lê congregações somente pelo contrato público `organization/public` (`CongregationDirectory`).

## 17. Deploy de MVP e homologação

A Core API possui empacotamento OCI em `Dockerfile` e é publicada como serviço web gratuito pelo
Blueprint `../../render.yaml`. O Container usa a porta `10000` e expõe o health check
`/api/v1/health`.

O plano gratuito aceita cold starts e não possui SLA de produção. O procedimento operacional está
documentado em `../../docs/deployment/README.md`.
