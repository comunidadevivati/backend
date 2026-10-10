# Packages — Comunidade Viva e Eficaz

## 1. Objetivo

Este diretório contém pacotes reutilizáveis entre as aplicações do monorepo.

Tecnologias e ferramentas:

- TypeScript strict
- ESM e NodeNext
- pnpm Workspaces
- Turborepo
- Zod 4
- Vitest
- Oxlint e Oxfmt

Cada pacote deve possuir uma responsabilidade explícita e uma API pública controlada.

## 2. Princípios arquiteturais

- High Cohesion, Low Coupling.
- SOLID.
- Dependency Inversion.
- Separation of Concerns.
- Encapsulamento.
- Contratos explícitos.
- Versionamento controlado.
- Menor superfície pública possível.

Não criar pacotes compartilhados apenas para reduzir a quantidade de arquivos.

## 3. Estrutura de referência

packages/
├── contracts/
│ └── README.md
├── config/
│ └── README.md
├── observability/
│ └── README.md
├── testing/
│ └── README.md
└── README.md

Os diretórios acima são candidatos e serão criados somente quando necessários.

## 4. Contracts

Responsável por contratos compartilhados entre aplicações.

Pode conter:

- Schemas Zod de integração.
- Tipos derivados dos contratos.
- Identificadores de eventos.
- Contratos de mensagens.
- Contratos versionados de jobs.
- Tipos públicos de integração.

Não deve conter:

- Aggregates.
- Entities de domínio.
- Repositories concretos.
- Use Cases.
- Controllers.
- Implementações de regras de negócio.

Contratos públicos devem ser mínimos, estáveis e versionados conforme necessário.

## 5. Config

Responsável por capacidades reutilizáveis de configuração.

Pode conter:

- Utilitários de validação.
- Schemas técnicos reutilizáveis.
- Tipos de configuração.
- Convenções de variáveis de ambiente.

Não deve conter:

- Segredos.
- Valores específicos de produção.
- Configurações internas de um Bounded Context.
- Dependências desnecessárias entre aplicações.

A configuração final de cada aplicação permanece sob sua responsabilidade.

## 6. Observability

Responsável por recursos técnicos reutilizáveis de observabilidade.

Pode conter:

- Convenções de CorrelationId.
- Instrumentação OpenTelemetry.
- Abstrações de logger.
- Helpers de métricas.
- Contexto de tracing.

Não deve conter:

- Regras de domínio.
- Informações sensíveis.
- Dependência obrigatória de uma aplicação específica.

## 7. Testing

Responsável por ferramentas de teste compartilháveis.

Pode conter:

- Factories técnicas.
- Helpers de testes de integração.
- Configurações reutilizáveis de Vitest.
- Utilitários de Testcontainers.
- Test doubles de serviços técnicos.

Não deve conter:

- Dependências de produção desnecessárias.
- Regras de negócio duplicadas.
- Fixtures com credenciais reais.
- Mocks que escondam inconsistências entre contratos.

## 8. Regras de dependência

Permitido:

apps/bff -> packages/contracts
apps/core-api -> packages/contracts
apps/worker -> packages/contracts

Proibido:

packages/contracts -> apps/core-api
packages/config -> apps/bff
packages/observability -> apps/worker

Um pacote compartilhado nunca deve importar implementações internas de uma aplicação.

## 9. Dependências entre packages

As dependências devem formar um grafo acíclico.

Evitar que:

- contracts dependa de infrastructure.
- config dependa de módulos de negócio.
- observability dependa de controllers.
- testing seja carregado em produção.

Utilizar dependency-cruiser para validar os limites arquiteturais.

## 10. Exports públicos

Cada pacote deve possuir exports explícitos.

Regras:

- Não permitir acesso irrestrito aos arquivos internos.
- Não utilizar deep imports não documentados.
- Expor somente contratos necessários.
- Utilizar named exports por padrão.
- Evitar barrel files que causem dependências circulares.
- Preservar compatibilidade dos contratos públicos.

## 11. Nomenclatura

Utilizar nomes claros, específicos e coerentes.

Exemplos candidatos:

- @comvivati/contracts
- @comvivati/config
- @comvivati/observability
- @comvivati/testing

Os nomes definitivos dos packages serão estabelecidos durante sua criação.

## 12. Versionamento

Utilizar SemVer conforme as decisões aprovadas.

Mudanças incompatíveis em contratos devem ser identificadas e documentadas.

Changesets poderá ser utilizado seletivamente.

Pacotes internos não precisam ser publicados em registry externo sem necessidade concreta.

## 13. Segurança

- Nunca compartilhar credenciais.
- Nunca incluir tokens em fixtures.
- Não exportar objetos internos de autenticação.
- Validar dados recebidos nas fronteiras.
- Evitar expor dados pessoais em contratos sem necessidade.
- Respeitar os princípios de menor privilégio e minimização.

## 14. Qualidade

Cada pacote deverá:

- Compilar isoladamente quando aplicável.
- Passar pelo TypeScript strict.
- Passar pelo Oxlint.
- Seguir a formatação Oxfmt.
- Possuir testes proporcionais à criticidade.
- Ter documentação própria.
- Declarar suas dependências explicitamente.

## 15. Quando criar um package

Criar um novo pacote somente quando:

- Houver reutilização real.
- A responsabilidade estiver clara.
- A API pública puder ser definida.
- Não houver vazamento de domínio.
- O benefício superar o custo de manutenção.

Não transformar packages/ em um diretório genérico de código compartilhado.

## 16. Evolução

A criação de novos pacotes deve respeitar as decisões arquiteturais existentes.

Mudanças relevantes nas fronteiras ou contratos deverão ser documentadas em docs/adr/.
