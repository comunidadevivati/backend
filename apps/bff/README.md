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

- `POST /auth/register`: `{ "name", "phone", "email", "password" }`, com telefone somente em
  dígitos. `201` com o cookie de sessão e o mesmo formato de `/auth/login`, com a mensagem
  `"Usuário cadastrado com sucesso."`: a conta nasce `ACTIVE` e
  o usuário já fica autenticado (sessão criada pelo mesmo serviço do login, revogando a anterior do
  navegador, sem consumir tentativa de login); `409` para e-mail já
  cadastrado (comparação sem diferenciar maiúsculas); `400` com `fields` listando somente os nomes
  dos campos recusados. O cadastro também envia o link de verificação do e-mail (a conta nasce com
  `emailVerified: false`); uma falha nesse envio não desfaz o cadastro. As regras de nome, telefone e força de senha ficam em
  `src/auth/domain/policies` e espelham as validações do frontend.
- `POST /auth/login`: `200` com o cookie de sessão e
  `{ authenticated: true, message: "Usuário autenticado com sucesso.", csrfToken, user }`; `400` para
  corpo inválido; `401` para credenciais inválidas, sem distinguir e-mail inexistente, senha
  incorreta ou usuário suspenso. Revoga a sessão anterior do mesmo navegador.
- `POST /auth/password-recovery`: `{ "email" }`; responde sempre `200` com a mensagem neutra
  `{ "message": "Se existir uma conta para este e-mail, enviaremos as instruções." }`. Para uma
  conta ativa, emite um token de uso único com validade de 15 minutos e solicita o envio pelo
  provider configurado, sem revelar a existência da conta.
- `POST /auth/password-reset`: `{ "token", "password" }`; valida o link e a política de senha,
  redefine a senha, revoga todas as sessões e abre uma nova sessão no navegador que redefiniu (mesma
  resposta do login, com a mensagem `Senha redefinida com sucesso.`). O token não pode ser reutilizado.
- `POST /auth/email-verification`: `{ "token" }`; público (o link pode ser aberto em outro
  aparelho). Consome o token de uso único (validade de 24 horas) e marca o e-mail como verificado;
  `400` para link inválido, expirado ou já usado.
- `POST /auth/email-verification/resend`: exige a sessão e o header `X-CSRF-Token`. Envia um novo
  link para o e-mail da sessão e invalida os anteriores; `409` se o e-mail já foi verificado, `429`
  durante o intervalo mínimo entre envios (60 segundos) e `503` se o provedor de e-mail falhar.
- `GET /auth/me`: `{ authenticated, csrfToken, user: { subject, email, name, emailVerified } }`
  (o mesmo `user` de login, cadastro e redefinição de senha). O token CSRF
  deve permanecer apenas em memória no frontend. Renova a expiração por inatividade.
- `POST /auth/logout`: exige o header `X-CSRF-Token`, revoga a sessão no banco e remove o cookie.
  Responde `200` com `{ "authenticated": false, "message": "O logout foi efetuado com sucesso." }`.

O BFF aceita requisições com credenciais somente da origem definida em `WEB_BASE_URL`.

### Organization e congregações

Rotas encaminhadas à Core API ([ADR 0006](../../docs/adr/0006-organization-e-integracao-bff-core-api.md)).
Todas exigem a sessão com **e-mail verificado** (`401` sem sessão, `403` sem verificação); as que
alteram estado (`PATCH` e `POST`) exigem também `X-CSRF-Token`. Corpo e status da Core API são
repassados (erros de negócio em `application/problem+json`); falhas da Core API viram `502`, e a
indisponibilidade, `503`.

| Rota do BFF                                                | Descrição                              |
| ---------------------------------------------------------- | -------------------------------------- |
| `GET /api/v1/organization`                                 | Organização principal (Matriz)         |
| `PATCH /api/v1/organization`                               | Alteração parcial; exige `version`     |
| `POST /api/v1/organization/activate` \| `/deactivate`      | Muda a situação                        |
| `GET /api/v1/congregations?status=&cursor=&limit=`         | Lista paginada `{ items, nextCursor }` |
| `GET /api/v1/congregations/:id`                            | Consulta                               |
| `POST /api/v1/congregations`                               | Registra (nasce `DRAFT`)               |
| `PATCH /api/v1/congregations/:id`                          | Alteração parcial; exige `version`     |
| `POST /api/v1/congregations/:id/activate` \| `/deactivate` | Ativa/reativa ou inativa               |

### Membros e vínculos

Mesmas regras de sessão, e-mail verificado, CSRF e repasse de erros das rotas de Organization
([ADR 0007](../../docs/adr/0007-members-e-vinculos-congregacionais.md)).

| Rota do BFF                                                          | Descrição                                |
| -------------------------------------------------------------------- | ---------------------------------------- |
| `GET /api/v1/members?status=&congregationId=&search=&cursor=&limit=` | Lista paginada `{ items, nextCursor }`   |
| `GET /api/v1/members/:id`                                            | Consulta                                 |
| `POST /api/v1/members`                                               | Registra (nasce `ACTIVE`)                |
| `PATCH /api/v1/members/:id`                                          | Alteração parcial; exige `version`       |
| `POST /api/v1/members/:id/activate`                                  | `/deactivate`                            | `/archive`                 | `/restore` | Muda a situação |
| `GET /api/v1/members/:id/memberships`                                | Histórico de vínculos, com a congregação |
| `POST /api/v1/members/:id/memberships`                               | Registra vínculo (nasce `PENDING`)       |
| `POST /api/v1/memberships/:id/activate`                              | `/deactivate`                            | Ativa ou encerra o vínculo |

Configuração: `CORE_API_URL` (origem da Core API, sem `/api/v1`), `CORE_API_TOKEN` (o mesmo da Core
API) e `CORE_API_TIMEOUT_MS` (padrão 30000, folga para o cold start do Render).

### Usuários

Além do cadastro público (`POST /auth/register`), usuários podem ser criados pelo CLI (a senha é
solicitada sem eco no terminal):

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

### Envio de recuperação

O [ADR 0004](../../docs/adr/0004-recuperacao-de-senha-com-resend.md) define o Resend. Em ambiente
local, `EMAIL_PROVIDER=disabled` mantém o fluxo sem chamada externa. Para enviar de verdade:

```text
EMAIL_PROVIDER=resend
RESEND_API_KEY=<secret>
EMAIL_FROM=Comunidade Viva e Eficaz (HML) <seguranca@mail.comvivaeficaz.com.br>
PASSWORD_RESET_TTL_MINUTES=15
PASSWORD_RESET_COOLDOWN_SECONDS=60
EMAIL_SEND_TIMEOUT_MS=5000
```

O modelo do e-mail fica em `src/auth/infrastructure/email/password-recovery-email.template.ts`,
com HTML e texto puro, nas cores do frontend. A logo (`assets/email/logo-comunidade-viva.png`)
segue como anexo inline (CID), sem depender de uma URL pública.

Localmente, use a chave de HML (`comvivati-hml`) no `.env.local`, que não é versionado. Nos
ambientes publicados, a chave fica somente nos secrets do Render.

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

Provisoriamente ([ADR 0006](../../docs/adr/0006-organization-e-integracao-bff-core-api.md)), o
BFF se autentica na Core API com `Authorization: Bearer <CORE_API_TOKEN>`, por REST/JSON e com
timeout. A credencial identifica o BFF, não o usuário.

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
