# ADR 0003 — Autenticação por e-mail e senha com PostgreSQL

- Status: Accepted
- Data: 2026-10-16
- Substitui: decisões de Keycloak/OIDC e Redis registradas no ADR 0002 e nas instruções do repositório

## Contexto

O MVP usava Keycloak (OIDC Authorization Code + PKCE) como Identity Provider e Upstash Redis para as
sessões do BFF. Na topologia gratuita, o Keycloak opera abaixo da memória mínima recomendada no
Render Free, aumenta o cold start e exige configuração manual de realm, client e tema. Redis existia
somente para as sessões. A direção do projeto decidiu simplificar a autenticação para um login com
e-mail e senha, usando apenas PostgreSQL.

## Decisão

- Remover Keycloak, OIDC e Redis do backend, do deploy e do ambiente local.
- O BFF autentica com `POST /auth/login` (`{ email, password }`) e mantém os contratos de
  `GET /auth/me` e `POST /auth/logout`.
- Usuários e sessões ficam no schema PostgreSQL `auth`, de propriedade exclusiva do BFF, acessado com
  Drizzle ORM e migrations versionadas em `apps/bff/drizzle`, aplicadas na inicialização do BFF.
- Senhas são armazenadas com scrypt (`N=2^15, r=8, p=3`, salt aleatório de 16 bytes).
- A sessão é um token opaco aleatório de 32 bytes em cookie assinado, HttpOnly, `SameSite=Lax` e
  `Secure`/`__Host-` em HTTPS. O banco guarda somente o SHA-256 do token.
- Expiração por inatividade de 30 minutos, renovada a cada `GET /auth/me`, com limite absoluto de
  12 horas. Sessões vencidas são removidas a cada novo login.
- O token CSRF continua sendo entregue por `/auth/login` e `/auth/me` e exigido em `POST /auth/logout`.
- Usuários são criados pelo CLI `pnpm --dir apps/bff user:create`; não há cadastro público.

## Justificativa

Elimina dois serviços externos (Keycloak e Redis) e o serviço Render mais instável, mantendo as
propriedades de segurança do modelo BFF: nenhum token ou segredo chega ao JavaScript do navegador,
a sessão é revogável no servidor e o frontend continua consumindo `/auth/*` na mesma origem.

## Consequências

- O frontend passa a exibir um formulário de e-mail e senha em vez de redirecionar ao Keycloak.
- O BFF passa a depender de `DATABASE_URL` e a acessar diretamente o schema `auth`. Essa é uma
  exceção explícita à regra de que o BFF não acessa PostgreSQL; os schemas dos Bounded Contexts da
  Core API continuam inacessíveis ao BFF.
- O vínculo entre conta digital e Member, papéis e permissões continuam pendentes no contexto
  Identity/Authorization da Core API. A migração das credenciais para a Core API exigirá novo ADR.
- Recuperação de senha, cadastro por convite, bloqueio por tentativas e rate limiting do login ainda
  não estão implementados e devem ser tratados antes de produção.
- O Worker BullMQ, que dependia de Redis, permanece fora do escopo; a tecnologia de filas deverá ser
  definida novamente quando houver processamento assíncrono.

## Alternativas consideradas

- Manter Keycloak: descartado pela complexidade operacional e pelo limite de memória do plano gratuito.
- Sessões em Redis com usuários no PostgreSQL: descartado para não manter um segundo serviço apenas
  para sessões.
- JWT sem estado no navegador: descartado porque impede revogação imediata e expõe tokens ao cliente.
- Credenciais na Core API com chamada BFF → Core: postergado porque a propagação de identidade entre
  BFF e Core API ainda não está decidida.
