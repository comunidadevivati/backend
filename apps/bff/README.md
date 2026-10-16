# BFF — Comunidade Viva e Eficaz

## 1. Objetivo

O Backend for Frontend (BFF) é a camada intermediária entre a aplicação web e a Core API.

Tecnologias:

- NestJS
- Fastify
- TypeScript
- Node.js
- Zod para validação de contratos
- Drizzle ORM e PostgreSQL para usuários e sessões

O BFF é uma aplicação independente, com build e deploy próprios.

## 2. Responsabilidades

O BFF deve:

- Autenticar usuários por e-mail e senha.
- Gerenciar sessões no servidor (PostgreSQL, schema `auth`).
- Utilizar cookies Secure, HttpOnly e SameSite apropriado.
- Implementar proteção contra CSRF.
- Agregar respostas de APIs quando necessário.
- Adaptar contratos para necessidades específicas do frontend.
- Encaminhar identidade autenticada à Core API de forma segura.
- Aplicar timeouts e políticas de resiliência.
- Propagar CorrelationId e contexto de observabilidade.

## 3. Responsabilidades proibidas

O BFF não deve:

- Implementar regras centrais de negócio.
- Acessar diretamente os schemas PostgreSQL dos Bounded Contexts. O único schema do BFF é `auth`
  (ADR 0003).
- Executar migrations dos domínios.
- Gerenciar roles, grants ou políticas de autorização de negócio.
- Confiar em identificadores de usuários fornecidos arbitrariamente pelo navegador.
- Expor o token de sessão ou hashes de senha ao JavaScript do frontend.
- Substituir a validação de autorização da Core API.

## 4. Estrutura arquitetural de referência

src/
├── auth/
│ ├── application/
│ ├── infrastructure/
│ └── presentation/
├── core-api/
│ ├── contracts/
│ └── infrastructure/
├── session/
├── config/
├── observability/
├── shared/
└── main.ts

Esta estrutura é uma referência inicial, sujeita a refinamento durante a implementação.

## 5. Autenticação

Login por e-mail e senha, decidido no [ADR 0003](../../docs/adr/0003-autenticacao-email-senha-postgresql.md).
Não há Identity Provider externo.

Fluxo:

1. O frontend envia `POST /auth/login` com `{ "email", "password" }`.
2. O BFF valida a senha (scrypt) de um usuário `ACTIVE` no schema `auth`.
3. O BFF cria uma sessão no PostgreSQL e devolve um cookie de sessão seguro.
4. O frontend consulta `GET /auth/me` para obter o usuário e o token CSRF.

O navegador não armazena tokens em localStorage ou sessionStorage.

### Contrato web implementado

- `POST /auth/login`: `200` com o mesmo corpo de `/auth/me` e o cookie de sessão; `400` para
  corpo inválido; `401` para credenciais inválidas, sem distinguir e-mail inexistente, senha
  incorreta ou usuário suspenso. Revoga a sessão anterior do mesmo navegador.
- `GET /auth/me`: `{ authenticated, csrfToken, user: { subject, email, name } }`. O token CSRF
  deve permanecer apenas em memória no frontend. Renova a expiração por inatividade.
- `POST /auth/logout`: exige o header `X-CSRF-Token`, revoga a sessão no banco e remove o cookie.

O BFF aceita requisições com credenciais somente da origem definida em `WEB_BASE_URL`.

### Usuários

Não há cadastro público. Crie usuários com o CLI (a senha é solicitada sem eco no terminal):

```bash
pnpm --dir apps/bff user:create --email pessoa@exemplo.com --name "Nome da Pessoa"
```

## 6. Sessões

- Token opaco de 32 bytes em cookie assinado, HttpOnly, `SameSite=Lax`; `Secure` e prefixo
  `__Host-` quando `BFF_BASE_URL` usa HTTPS.
- O banco armazena somente o SHA-256 do token.
- Expiração por inatividade de 30 minutos e absoluta de 12 horas.
- Rotação da sessão a cada login e revogação no logout.
- Sessões de usuários suspensos deixam de ser aceitas imediatamente.
- Sessões vencidas são removidas a cada novo login.

### Banco de dados

- Schema: `src/auth/infrastructure/database/auth.schema.ts`.
- Migrations versionadas: `drizzle/`, geradas com `pnpm --dir apps/bff db:generate` e aplicadas
  automaticamente quando o BFF inicia.
- Desenvolvimento local: `docker compose up -d postgres` na raiz e `DATABASE_URL` em `.env.local`
  (ver `.env.example`).

## 7. Comunicação BFF → Core API

Requisitos:

- HTTPS/TLS.
- Identidade autenticada verificável.
- Timeout por operação.
- Tratamento padronizado de erros.
- Propagação de CorrelationId.
- Retry somente em operações seguras ou idempotentes.
- Validação de respostas externas.
- Observabilidade distribuída.

A estratégia definitiva de propagação de identidade e Token Exchange permanece pendente de aprovação arquitetural.

Não encaminhar headers de identidade fornecidos pelo navegador como fonte confiável.

## 8. Autorização

O BFF poderá consultar capacidades para adaptar a interface.

Entretanto:

- A Core API é responsável pela autorização de negócio.
- Toda operação protegida deve ser validada pela Core API.
- O BFF não deve interpretar a visibilidade de componentes como autorização.
- O acesso a recursos de outra congregação deve ser validado no servidor.

## 9. Contratos

Os contratos HTTP devem seguir as decisões arquiteturais aprovadas:

- OpenAPI 3.1.
- Contract-First.
- Zod para validação.
- Result Pattern.
- RFC 9457 para Problem Details.
- Versionamento explícito.
- Compatibilidade controlada.

A escolha do protocolo principal REST/GraphQL/gRPC continua pendente.

## 10. Segurança

- Headers de segurança apropriados.
- CORS restrito.
- CSRF para operações aplicáveis.
- Proteção contra session fixation.
- Rate limiting conforme risco.
- Tratamento seguro de cookies.
- Segredos fora do código.
- Logs sem tokens, cookies ou credenciais.
- Validação de redirect URIs e destinos permitidos.

## 11. Infraestrutura

Hospedagem de MVP e homologação:

- Render Free, por meio do Blueprint `../../render.yaml`.

O processo Node escuta em todas as interfaces dentro do Container. Os segredos são cadastrados no
Dashboard do Render durante a criação do Blueprint e não pertencem ao repositório. O frontend
permanece na Cloudflare e encaminha `/auth/*` ao BFF, preservando a sessão na mesma origem. O
procedimento operacional está em `../../docs/deployment/README.md`.

O BFF deve:

- Ser stateless em relação ao processo.
- Utilizar PostgreSQL para sessões.
- Suportar múltiplas instâncias.
- Implementar healthchecks e readiness.
- Encerrar conexões de forma controlada.
- Permitir deploy independente da Core API.

## 12. Observabilidade

- OpenTelemetry.
- Pino.
- Logs estruturados.
- CorrelationId.
- Métricas de latência.
- Rastreamento de chamadas à Core API.
- Monitoramento de falhas de autenticação.

Nunca registrar senhas, tokens de sessão ou dados pessoais desnecessários.

## 13. Testes

- Vitest.
- Testes de sessão.
- Testes de autenticação por e-mail e senha.
- Testes de integração com PostgreSQL real (Testcontainers): `pnpm --dir apps/bff test:integration`.
- Testes de CSRF.
- Testes de integração com a Core API.
- Testes de contratos.
- Testes de segurança.
- Testes de concorrência e expiração de sessões.

## 14. Regras de evolução

O BFF deve permanecer específico para as necessidades da aplicação web.

Novas responsabilidades somente devem ser adicionadas quando forem relacionadas à apresentação, autenticação web ou composição de APIs.

Regras de domínio devem continuar na Core API.

Mudanças arquiteturais relevantes devem ser documentadas em docs/adr/.
