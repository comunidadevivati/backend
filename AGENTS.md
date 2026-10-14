# AI Agent Instructions — Comunidade Viva e Eficaz Backend

## 1. Project

Repository: comunidadevivati/backend

Architecture: Modular Monolith + DDD + Clean Architecture + SOLID

Language: TypeScript

Runtime: Node.js 24

Package manager: pnpm

Monorepo: pnpm Workspaces + Turborepo

Applications:

- apps/bff: Web Backend for Frontend.

- apps/core-api: Main business API.

- apps/worker: Continuous asynchronous processing.

Initial Bounded Contexts:

- Organization

- Identity

- Authorization

- Members

## Desenvolvimento integrado: backend e frontend

Este arquivo está no repositório **backend**, mas o trabalho não está limitado a ele. O agente **deve acessar, inspecionar, implementar e validar o frontend quando isso for necessário** para entregar ou comprovar uma funcionalidade de ponta a ponta. Não considerar uma alteração de API/BFF finalizada apenas porque os testes do backend passaram, quando o comportamento correspondente também precisa funcionar na aplicação web.

### Repositórios locais (Windows 11)

| Projeto                             | Caminho absoluto                                     | Repositório remoto         |
| ----------------------------------- | ---------------------------------------------------- | -------------------------- |
| Backend (diretório deste documento) | `C:\Users\tsoar\Documents\projects\viva\api\backend` | `comunidadevivati/backend` |
| Frontend web                        | `C:\Users\tsoar\Documents\projects\viva\web`         | `comunidadevivati/web`     |

- Esses diretórios são **dois repositórios Git independentes**, não pacotes do mesmo workspace. Não presumir que comandos executados na raiz do backend incluam o frontend.
- No Git Bash, os caminhos correspondentes são `/c/Users/tsoar/Documents/projects/viva/api/backend` e `/c/Users/tsoar/Documents/projects/viva/web`. No WSL, geralmente `/mnt/c/Users/tsoar/Documents/projects/viva/...`; confirmar o caminho e as permissões antes de utilizá-lo.
- Se a ferramenta/agente não tiver acesso ao diretório irmão, solicitar acesso ou inclusão do frontend no workspace; **não criar uma cópia, submódulo, pasta `web` dentro do backend ou repositório substituto**.
- Ler o `AGENTS.md`, `CLAUDE.md`, `README.md`, `package.json`, configurações, contratos e convenções **do frontend**, se presentes, antes de alterá-lo. As regras específicas de cada repositório prevalecem para os respectivos arquivos.
- A aplicação frontend adota React 19, TypeScript, Vite 8, TanStack Router, TanStack Query, Zustand, React Hook Form + Zod, KY, Tailwind CSS, shadcn/ui, Vitest e pnpm, conforme decisões do projeto. **Conferir a implementação e as versões realmente instaladas**; não presumir que toda biblioteca planejada já esteja configurada.

### Quando atuar também no frontend

- Ao criar ou alterar endpoints, contratos, DTOs, autenticação, autorização, sessão, mensagens de erro, paginação ou qualquer comportamento consumido pela interface, **verificar os consumidores no frontend**.
- Quando necessário, **adaptar o frontend no próprio repositório**, incluindo cliente HTTP, tipos, validações, rotas, páginas, estados, tratamento de erro e testes, para demonstrar o funcionamento da alteração feita no backend.
- Para fluxos OIDC, validar a jornada real: frontend → `/auth/login` no BFF → Keycloak → `/auth/callback` no BFF → frontend → `/auth/me`, incluindo login, sessão, acesso protegido e logout quando implementado. Confirmar URLs e portas reais nas configurações antes de testar; referências históricas de desenvolvimento são frontend `http://localhost:5173` e BFF `http://localhost:3000`.
- Respeitar o modelo BFF: credenciais e tokens sensíveis permanecem no servidor; a aplicação web não deve receber segredos nem persistir tokens de autenticação em `localStorage`, `sessionStorage` ou código-fonte. Verificar cookies HttpOnly, políticas SameSite/Secure, CORS e credenciais HTTP conforme ambiente.
- Preferir integração a partir de contratos efetivos (OpenAPI/DTOs/tipos e respostas reais); **não inventar endpoints, formatos de resposta ou permissões**. Não contornar autenticação ou autorização com mocks como solução de produção.
- Se a tarefa for exclusivamente interna ao backend e não houver efeito observável no frontend, registrar essa constatação e não modificar a aplicação web desnecessariamente.

### Fluxo obrigatório de trabalho entre repositórios

1. Inspecionar `git status --short`, branch, diferenças relevantes e arquivos não rastreados **separadamente em cada repositório envolvido**. Preservar alterações locais e não sobrescrever o trabalho do usuário.
2. Identificar o contrato entre BFF/Core API/frontend e o comportamento a validar. Distinguir decisões arquiteturais aprovadas de propostas ainda pendentes.
3. Implementar a menor alteração consistente no backend e, **quando necessário**, no frontend, respeitando a arquitetura e as regras locais de cada projeto.
4. Executar scripts **existentes** de formatação, lint, typecheck, testes e build nos projetos afetados; consultar `package.json` antes de escolher comandos. Executar teste integrado ou manual ponta a ponta quando depender de Keycloak, Redis, PostgreSQL ou serviços locais. Não afirmar que houve integração real se foram executados apenas testes unitários.
5. Relatar resultados por repositório: arquivos modificados, testes executados, cobertura medida, falhas, dependências externas e verificações não realizadas. As 39 provas unitárias e a cobertura de 100% anteriormente observadas se referem ao **escopo configurado naquele momento**; não pressupor cobertura integral de toda a aplicação.
6. Não executar `git add .`, `commit`, `push`, `merge`, `rebase`, reset destrutivo ou alteração de ambiente de produção sem autorização explícita. Se aprovados, criar **commits separados por repositório**, no padrão semântico português brasileiro definido abaixo; jamais tratar os dois repositórios como uma única operação Git.

### Execução assistida e confiabilidade

- Trabalhar em etapas pequenas e verificáveis; relatar o resultado e aguardar confirmação antes de avançar para a etapa seguinte quando em modo interativo.
- Não repetir comandos de diagnóstico desnecessariamente quando logs e arquivos já apontam a causa.
- Não assumir que substituições de texto encontrarão trechos idênticos: inspecionar o arquivo real antes de editá-lo, privilegiar edições estruturadas e verificar o diff depois.
- Corrigir erros de compilação, lint ou teste introduzidos pelas próprias alterações antes de considerar a etapa encerrada; não reduzir regras de qualidade, thresholds de cobertura ou verificações de segurança para fazer a execução passar.
- Respeitar a configuração atual do repositório: por exemplo, versões principais de TypeScript devem permanecer compatíveis com `typescript-eslint` e o conjunto instalado de ferramentas; não forçar upgrades incompatíveis.
- Nos serviços NestJS com ESM/TSX, ao usar `@Inject(Classe)`, importar `Classe` como **valor** (`import { Classe }`), nunca `import type { Classe }`, e manter a injeção explícita quando requerida pela configuração existente.

## 2. Instruction Priority

Before modifying files:

1\. Read this AGENTS.md.

2\. Read the README.md of the affected directory.

3\. Read applicable architecture documentation and ADRs.

4\. Inspect existing implementation and conventions.

5\. Identify impacted contracts, dependencies and tests.

Never treat an architectural proposal as an approved decision.

Do not replace approved technologies without explicit authorization.

## 3. Working Rules

- Work incrementally.

- Make minimal, focused changes.

- Do not implement unrelated features.

- Do not generate unnecessary abstractions.

- Do not rewrite existing code without justification.

- Preserve backward compatibility unless a breaking change is approved.

- Explain architectural blockers before making irreversible changes.

- Never commit or push without an explicit request.

- Never modify production resources without authorization.

## 4. Architecture

Follow:

- Domain-Driven Design.

- Clean Architecture.

- SOLID.

- Dependency Inversion.

- Explicit Use Cases.

- Selective CQRS.

- Modular Monolith.

Bounded Contexts belong inside apps/core-api.

Do not create a separate microservice for each Bounded Context.

Keep the Domain independent of frameworks and infrastructure.

## 5. Layer Responsibilities

### Domain

Contains:

- Aggregates

- Entities

- Value Objects

- Domain Services

- Domain Events

- Business invariants

Must not import:

- NestJS

- Drizzle

- HTTP frameworks

- Database adapters

- Application

- Infrastructure

- Presentation

### Application

Contains:

- Use Cases

- Commands and queries

- Ports

- Application policies

- Transaction orchestration

May depend on Domain and approved public contracts.

Must not depend on concrete database or HTTP implementations.

### Infrastructure

Contains:

- Drizzle repositories

- PostgreSQL adapters

- External service adapters

- Outbox/Inbox persistence

- Implementations of Application ports

### Presentation

Contains:

- Controllers

- Request and response DTOs

- Input validation

- Transport error mapping

Must call Application interfaces rather than repositories.

## 6. Bounded Context Boundaries

Each context owns its data and business rules.

Communication between contexts must use explicit public contracts.

Use stable IDs for references.

Do not import repositories or internal entities from another context.

Do not query another context's schema arbitrarily.

Prevent circular dependencies.

## 7. TypeScript Standards

- TypeScript strict.

- ESM and NodeNext.

- Named exports by default.

- Avoid any.

- Prefer explicit contracts.

- Use classes for DDD elements and NestJS integration.

- Use arrow functions for pure functional helpers.

- Prefer immutable Value Objects.

- Avoid unnecessary inheritance.

- Use clear and consistent names.

- Avoid default exports unless technically required.

## 8. Dependencies

- pnpm Workspaces.

- Turborepo.

- pnpm Catalogs when applicable.

- Explicit package exports.

- dependency-cruiser for architecture boundaries.

- Knip according to the approved adoption plan.

Do not use deep imports into private package files.

Do not create circular package dependencies.

## 9. Data and Persistence

- PostgreSQL 18.

- Drizzle ORM.

- One schema per Bounded Context.

- UUIDv7 for identifiers.

- Versioned Drizzle migrations.

- Application-level transaction abstraction.

- READ COMMITTED by default.

- Optimistic concurrency where required.

- Selective PostgreSQL RLS.

Do not expose Drizzle records as Domain entities.

Do not use cross-context database access as a shortcut.

## 10. Identity and Authorization

Identity Provider: Keycloak.

Authentication:

- OIDC Authorization Code + PKCE.

- Server-side BFF sessions.

- Secure, HttpOnly cookies.

- CSRF protection.

Authorization:

- RBAC + ABAC + ReBAC.

- Deny by default.

- Explicit deny takes precedence.

- Organization, Congregation and Resource scopes.

- Resource-based decisions.

- Critical-operation revalidation.

- Audit sensitive operations.

Never trust arbitrary user identity headers from the browser.

Never treat a service account as a human user.

Do not use matching emails alone to link identities and members.

The definitive BFF-to-Core identity propagation mechanism

must follow the approved architecture once finalized.

## 11. API Contracts

- OpenAPI 3.1.

- Contract-First.

- Zod 4 for transport validation.

- Separate transport DTOs from Domain.

- Result Pattern.

- RFC 9457 Problem Details.

- Major versioning under /api/v1 when HTTP routing is applicable.

- Cursor pagination by default.

- Idempotency for critical writes.

- Selective ETag/If-Match.

- Contract tests and compatibility checks.

Do not assume unresolved protocol choices are approved.

## 12. Events and Workers

- Local Domain Events.

- Durable Integration Events only when required.

- Transactional Outbox.

- Inbox/deduplication for critical consumers.

- BullMQ + Redis.

- BullMQ Job Schedulers.

- Exponential backoff.

- Controlled retries.

- Dead-letter or quarantine handling.

- Idempotent processing.

Do not share business implementations directly

between apps/worker and apps/core-api.

Use public contracts for cross-application communication.

## 13. Configuration and Secrets

- @nestjs/config.

- Zod-validated immutable configuration.

- Fail-fast on invalid configuration.

- Separate environments.

- SOPS + age where applicable.

- No secrets in source code.

- No secrets in logs.

- No credentials in README or ADR documents.

## 14. Quality

- Oxlint, including type-aware checks.

- Oxfmt.

- Vitest.

- Testcontainers for integration tests.

- Architecture tests.

- Contract tests.

- Risk-based coverage.

- Selective mutation and performance tests.

Respect the repository's scripts and configurations.

Do not report tests as passing unless executed successfully.

## 15. Observability

- OpenTelemetry.

- Pino.

- Grafana Alloy.

- Prometheus.

- Loki.

- Tempo.

- Grafana.

Propagate correlation and trace context.

Do not expose sensitive information in telemetry.

## 16. Infrastructure

Free-tier topology for MVP and homologation.

- Cloudflare Workers Static Assets for frontend.

- Cloudflare R2 for S3-compatible object storage.

- Render Free web services for BFF, Core API and Keycloak during MVP and homologation.

- Neon Free for PostgreSQL and Upstash Free for Redis during MVP and homologation.

- BullMQ worker deployment is postponed while no zero-cost continuous runtime is approved.

- GitHub Actions for CI/CD.

- Render Blueprint connected to the backend `main` branch after CI checks pass.

Do not claim the free topology is production-ready; it accepts cold starts, quotas and no SLA.

Do not choose pending providers without authorization.

## 17. Documentation

Maintain:

- Root README.md.

- Local directory README.md files.

- docs/architecture.

- docs/standards.

- docs/security.

- docs/deployment.

- docs/domains.

- docs/adr.

Update affected documentation when behavior or architecture changes.

Use ADRs for important architectural decisions.

Never silently change approved decisions.

## 18. MVP

Implement only the approved initial scope:

- Organization

- Identity

- Authorization

- Members

Keep optional future domains outside the MVP unless requested.

Organization:

- Organization and Congregation are separate Aggregates.

- Congregation states: DRAFT, ACTIVE, INACTIVE.

- UUIDv7 and stable institutional code.

- Controlled activation, deactivation and reactivation.

Identity:

- UserIdentity and Invitation are separate Aggregates.

- UserIdentity states: ACTIVE, SUSPENDED.

- Provisioning is coordinated by Application.

- Identity owns the digital account-to-member link.

- Invitations must be secure, expirable, single-use and idempotent.

Authorization:

- Role, RoleAssignment, Delegation and AccessRestriction

  are separate Aggregates.

- Permission catalog is versioned and code-governed.

- Prevent privilege escalation.

- Protect the last institutional administrator.

Members:

- Member and Membership are separate Aggregates.

- PersonProfile belongs inside Member.

- Member states: ACTIVE, INACTIVE, ARCHIVED.

- Membership states: PENDING, ACTIVE, INACTIVE.

- At most one active primary congregational membership.

- Preserve historical memberships.

- Apply field-level authorization for sensitive information.

## 19. Unresolved Decisions

Do not invent final choices for:

- REST versus GraphQL versus gRPC as principal protocol.

- BFF-to-Core token exchange and identity propagation.

- Number of digital accounts linked to one Member.

- Strong consistency strategy for congregation deactivation

  concurrent with membership registration.

- Final production providers for PostgreSQL, Redis and Keycloak.

- Email provider.

- Resilience library.

- AI agent runtime.

- Final RPO/RTO and infrastructure sizing.

Choose implementation details only when necessary

and within the boundaries of approved decisions.

## 20. Definition of Done

A change is complete only when:

- Its behavior matches the approved requirements.

- Architectural boundaries are respected.

- Types and validation are correct.

- Relevant tests are included and executed.

- Lint, formatting and typecheck pass where configured.

- No credentials or secrets are exposed.

- Documentation is updated when necessary.

- No unrelated files are modified.

## Padrão obrigatório de commits

Todas as mensagens de commit devem ser escritas em português brasileiro,

com escopo, emoji, contexto, alterações e impacto.

Formato:

tipo(escopo): emoji resumo objetivo em português

Contexto:

Motivo da alteração.

Alterações:

- Principais mudanças realizadas.

Impacto:

Consequências técnicas ou funcionais.

Tipos e emojis:

- feat: ✨

- fix: 🐛

- docs: 📝

- test: 🧪

- refactor: ♻️

- perf: ⚡

- style: 🎨

- build: 📦

- ci: 👷

- chore: 🔧

- revert: ⏪

Regras:

- Utilizar Conventional Commits.

- O escopo é obrigatório.

- O título deve ter no máximo 100 caracteres.

- O emoji correspondente ao tipo é obrigatório.

- As três seções do corpo são obrigatórias e devem conter conteúdo.

- O contexto deve explicar por que a mudança foi necessária.

- As alterações devem explicar o que foi modificado.

- O impacto deve informar as consequências da mudança.

- Não utilizar mensagens genéricas ou commits sem descrição.

- Usar fix(security) para correções de vulnerabilidades.

- Usar feat! ou BREAKING CHANGE para alterações incompatíveis.

- Preservar a compatibilidade com SemVer e Release Please.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.

<!-- END:turborepo-agent-rules -->
