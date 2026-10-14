# BFF — Comunidade Viva e Eficaz

## 1. Objetivo

O Backend for Frontend (BFF) é a camada intermediária entre a aplicação web e a Core API.

Tecnologias:

- NestJS
- Fastify
- TypeScript
- Node.js
- Zod para validação de contratos

O BFF é uma aplicação independente, com build e deploy próprios.

## 2. Responsabilidades

O BFF deve:

- Integrar a aplicação web com o Keycloak.
- Executar o fluxo OIDC Authorization Code com PKCE.
- Gerenciar sessões no servidor.
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
- Acessar diretamente os schemas PostgreSQL dos Bounded Contexts.
- Executar migrations dos domínios.
- Gerenciar roles, grants ou políticas de autorização de negócio.
- Confiar em identificadores de usuários fornecidos arbitrariamente pelo navegador.
- Expor access tokens ou refresh tokens ao JavaScript do frontend.
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

Identity Provider:

- Keycloak.

Fluxo:

1. O navegador solicita autenticação ao BFF.
2. O BFF inicia Authorization Code com PKCE.
3. O usuário autentica no Keycloak.
4. O BFF processa o callback OIDC.
5. O BFF cria uma sessão no servidor.
6. O navegador recebe um cookie de sessão seguro.
7. O BFF utiliza credenciais de servidor para acessar a Core API.

O navegador não deve armazenar tokens OIDC em localStorage ou sessionStorage.

### Contrato web implementado

- `GET /auth/login`: inicia o Authorization Code Flow com PKCE.
- `GET /auth/callback`: valida a transação OIDC, cria a sessão e redireciona para
  `/dashboard` na aplicação web.
- `GET /auth/me`: retorna somente os dados públicos da sessão, incluindo o token CSRF que deve
  permanecer apenas em memória no frontend.
- `POST /auth/logout`: exige o header `X-CSRF-Token`, revoga a sessão no Redis e remove o cookie.

O BFF aceita requisições com credenciais somente da origem definida em `WEB_BASE_URL`. Access
tokens, refresh tokens e ID tokens permanecem na sessão criptografada no servidor.

## 6. Sessões

Requisitos:

- Identificador de sessão opaco.
- Cookie Secure e HttpOnly.
- Política SameSite adequada.
- Proteção contra CSRF.
- Expiração absoluta e por inatividade, conforme política.
- Rotação da sessão após autenticação.
- Revogação de sessão.
- Armazenamento centralizado quando houver múltiplas instâncias.

Nenhum estado crítico da sessão deve depender exclusivamente da memória de um Container.

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
- Utilizar armazenamento externo para sessões.
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

Nunca registrar tokens OIDC, segredos de sessão ou dados pessoais desnecessários.

## 13. Testes

- Vitest.
- Testes de sessão.
- Testes de autenticação OIDC.
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
