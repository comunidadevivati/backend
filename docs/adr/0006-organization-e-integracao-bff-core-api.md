# ADR 0006 — Contexto Organization e integração provisória BFF → Core API

- Status: Proposed (implementado provisoriamente para o MVP; aguarda aprovação)
- Data: 2026-10-18

## Contexto

O MVP precisa de um CRUD da organização principal (Matriz) e das congregações, consumido pela
aplicação web. É o primeiro Bounded Context implementado na Core API e a primeira chamada do BFF à
Core API. Três pontos ainda não tinham decisão: persistência da Core API, o protocolo BFF → Core e
como a Core API reconhece o BFF. A propagação da identidade do usuário e a autorização por papéis
continuam pendentes e fora deste escopo, por decisão da direção do projeto.

## Decisão

- **Organization na Core API** (`apps/core-api/src/modules/organization`), com os Aggregates
  `Organization` e `Congregation`, schema PostgreSQL próprio `organization` e migrations Drizzle em
  `apps/core-api/drizzle`, aplicadas pela Core API ao iniciar (controle no schema `core_api`). Em
  cada ambiente, a Core API usa o mesmo banco Neon do BFF, sem acessar o schema `auth`.
- **Organização única**: a Matriz é a raiz da hierarquia e não há criação nem exclusão pela API. A
  Matriz e a congregação Sede são criadas ACTIVE pela migration `0001_matriz_e_sede`, com IDs
  UUIDv7 fixos.
- **REST/JSON sob `/api/v1`** entre BFF e Core API, com erros RFC 9457 (`application/problem+json`).
  É uma escolha de transporte para este fluxo; a escolha do protocolo principal continua pendente.
- **Credencial de serviço**: o BFF envia `Authorization: Bearer <CORE_API_TOKEN>`; a Core API
  compara em tempo constante e responde 401 sem ela. O token é gerado pelo Render no serviço da Core
  API e lido pelo BFF com `fromService`. Ele identifica o BFF, não pessoas, e não substitui a
  propagação da identidade do usuário.
- **Acesso provisório do MVP**: o BFF exige sessão válida com e-mail verificado e o header
  `X-CSRF-Token` nas alterações. Não há papéis nem permissões ainda.
- **Concorrência otimista**: cada registro tem `version`; alterações exigem a versão lida e
  respondem 409 quando ela está desatualizada.

## Justificativa

Mantém o monólito modular e a posse dos dados por contexto, sem antecipar as decisões pendentes de
autorização e identidade. A Core API, publicada em URL pública no Render, não fica aberta a
chamadas diretas do navegador ou de terceiros.

## Consequências

- Qualquer conta com e-mail verificado pode alterar a Matriz e as congregações. Isso é aceitável
  apenas enquanto não houver dados sensíveis e precisa ser substituído pelo contexto Authorization
  (perfis previstos: VISITANTE, ADMIN por congregação e SUPER na organização) antes de produção.
- A Core API não sabe qual usuário fez a alteração; auditoria por pessoa depende da propagação de
  identidade.
- A Core API passa a exigir `DATABASE_URL` e `CORE_API_TOKEN`, e o BFF `CORE_API_URL` e
  `CORE_API_TOKEN`. O frontend precisará encaminhar `/api/*` ao BFF, como já faz com `/auth/*`.
- Trocar o token exige reimplantar os dois serviços do ambiente.

## Alternativas consideradas

- Microsserviço próprio para Organization: descartado; os Bounded Contexts são módulos da Core API.
- Core API sem autenticação de serviço: descartado, pois a URL do Render é pública.
- JWT assinado pelo BFF com a identidade do usuário: adiado, pois faz parte da decisão pendente de
  propagação de identidade.
- mTLS ou rede privada do Render: indisponíveis ou incertos no plano gratuito.
