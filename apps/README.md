# Applications — Comunidade Viva e Eficaz

## 1. Objetivo

Este diretório contém as aplicações executáveis do backend.

O projeto utiliza um monorepo com pnpm Workspaces e Turborepo.

Cada aplicação possui responsabilidade própria, ciclo de build independente e estratégia de deploy específica.

## 2. Aplicações

### bff/

Backend for Frontend destinado à aplicação web.

Responsabilidades:

- Gerenciar sessões web seguras.
- Autenticar usuários por e-mail e senha (ADR 0003).
- Utilizar cookies HttpOnly.
- Adaptar e agregar respostas para o frontend.
- Comunicar-se com a Core API através de contratos.

Não deve:

- Implementar regras centrais de negócio.
- Acessar diretamente o banco de dados dos domínios.
- Substituir a autorização da Core API.

### core-api/

API principal desenvolvida com NestJS e Fastify.

Arquitetura:

- Modular Monolith.
- Domain-Driven Design (DDD).
- Clean Architecture.
- SOLID.
- Bounded Contexts independentes.

Módulos iniciais:

- Organization.
- Identity.
- Authorization.
- Members.

Responsabilidades:

- Executar Use Cases.
- Aplicar invariantes de domínio.
- Validar autorização.
- Gerenciar persistência através de abstrações.
- Expor contratos de aplicação e integração.
- Produzir eventos conforme necessidade.

### worker/

Aplicação de processamento assíncrono baseada em Node.js. A tecnologia de filas será redefinida
(BullMQ/Redis removidos pelo ADR 0003).

Responsabilidades:

- Processar jobs.
- Executar tarefas agendadas.
- Processar eventos de integração.
- Aplicar retries e idempotência.
- Registrar métricas, logs e traces.

Não deve:

- Duplicar regras de negócio da Core API.
- Acessar arbitrariamente os schemas de outros contextos.
- Depender de sessões HTTP de usuários.

## 3. Regras arquiteturais

1. Cada aplicação deve possuir responsabilidades explícitas.
2. Os Bounded Contexts do MVP pertencem à Core API.
3. Não criar uma API independente para cada Bounded Context.
4. Compartilhar apenas contratos e capacidades realmente reutilizáveis.
5. Não compartilhar implementações internas de domínio entre aplicações.
6. Evitar dependências circulares.
7. Preservar a independência dos builds e deploys.
8. Utilizar configuração validada por ambiente.
9. Não armazenar segredos no código-fonte.
10. Aplicar testes e validações antes dos deploys.

## 4. Dependências

Dependências entre aplicações devem ocorrer através de contratos explícitos.

Não são permitidos imports diretos para acessar implementações internas de outra aplicação.

Bibliotecas reutilizáveis devem ser disponibilizadas por packages/, respeitando suas responsabilidades e exports públicos.

## 5. Build e Deploy

bff:

- Render Free para MVP e homologação.
- Aprovação de produção condicionada a uma nova avaliação de capacidade e disponibilidade.

core-api:

- Render Free para MVP e homologação.
- Aprovação de produção condicionada a uma nova avaliação de capacidade e disponibilidade.

worker:

- Runtime Node.js de execução contínua.
- Deploy remoto postergado enquanto não houver infraestrutura contínua compatível com custo zero.

CI/CD:

- GitHub Actions.
- Um Render Blueprint por ambiente (ADR 0011): `render.yaml` na `main` e
  `render.homologation.yaml` na `homologation`, publicando após os checks do CI.
- Imagens construídas diretamente dos Dockerfiles do monorepo.
- Publicações independentes por aplicação.

## 6. Documentação

Cada aplicação deve possuir README.md próprio.

Toda mudança arquitetural relevante deve ser documentada em docs/adr/.

As regras gerais para agentes de IA serão mantidas no AGENTS.md da raiz.

## 7. Evolução

Novas aplicações somente devem ser criadas quando existir justificativa arquitetural concreta, como:

- Necessidade de escalabilidade independente.
- Isolamento operacional.
- Requisitos técnicos incompatíveis com a aplicação existente.
- Fronteiras de deploy justificadas.

A preferência inicial é evoluir os domínios como módulos internos da Core API.
