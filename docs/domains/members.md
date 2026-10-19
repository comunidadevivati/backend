# Domínio Members

Implementação: `apps/core-api/src/modules/members`. Decisões:
[ADR 0007](../adr/0007-members-e-vinculos-congregacionais.md).

## Linguagem ubíqua

| Termo             | Significado                                                                    |
| ----------------- | ------------------------------------------------------------------------------ |
| Membro            | Pessoa que participa da comunidade.                                            |
| Perfil pessoal    | Dados da pessoa dentro do membro: nome, data de nascimento, telefone e e-mail. |
| Vínculo           | Participação do membro em uma congregação, com início e fim.                   |
| Vínculo principal | A congregação de referência do membro; no máximo um ativo por vez.             |
| Vínculo aberto    | Vínculo PENDING ou ACTIVE.                                                     |
| Arquivado         | Membro retirado das listas do dia a dia, preservado para histórico.            |

## Aggregates

### Member

- Campos: nome completo, data de nascimento, telefone, e-mail, situação e versão.
- Situações: nasce `ACTIVE`; `ACTIVE ⇄ INACTIVE`; `INACTIVE → ARCHIVED`; `ARCHIVED → INACTIVE`.
- Arquivado: perfil somente leitura até ser restaurado.

### Membership

- Campos: membro, congregação (ID do contexto Organization), principal, situação, `startedOn`,
  `endedOn` e versão.
- Situações: nasce `PENDING`; `PENDING → ACTIVE`; `PENDING | ACTIVE → INACTIVE` (final).

## Invariantes

- Nome com 2 a 120 caracteres (letras, espaço, apóstrofo, ponto e hífen); data de nascimento ISO,
  existente, de 1900 até hoje; telefone com DDD e e-mail válidos, normalizados como em Organization.
- Um vínculo aberto por membro e congregação; no máximo um vínculo principal `ACTIVE` por membro
  (garantidos por índices únicos parciais).
- Registrar ou ativar vínculo exige membro `ACTIVE` e congregação `ACTIVE`; encerrar é sempre
  permitido.
- Inativar ou arquivar o membro exige que não haja vínculo aberto.
- Vínculo encerrado não é reaberto nem apagado.
- Toda alteração de perfil exige a versão lida (concorrência otimista).

## Use Cases

| Use Case               | Rota da Core API (`/api/v1`)                                    |
| ---------------------- | --------------------------------------------------------------- |
| ListMembers (cursor)   | `GET /members?status&congregationId&search&cursor&limit`        |
| GetMember              | `GET /members/:id`                                              |
| RegisterMember         | `POST /members`                                                 |
| UpdateMember           | `PATCH /members/:id`                                            |
| ChangeMemberStatus     | `POST /members/:id/{activate,deactivate,archive,restore}`       |
| ListMemberships        | `GET /members/:id/memberships` (histórico, com a congregação)   |
| RegisterMembership     | `POST /members/:id/memberships` (`{ congregationId, primary }`) |
| ChangeMembershipStatus | `POST /memberships/:id/{activate,deactivate}`                   |

O filtro `congregationId` lista os membros com vínculo aberto na congregação; `search` busca um
trecho do nome sem diferenciar maiúsculas de minúsculas.

## Integração com Organization

Somente pelo contrato público `CongregationDirectory` (`modules/organization/public/`), traduzido
pela Anticorruption Layer `CongregationCatalog`. Sem chave estrangeira entre schemas.

## Autorização

Provisória no MVP, como em Organization: o BFF exige sessão com e-mail verificado. O acesso a dados
pessoais por papel, escopo e campo depende do contexto Authorization.
