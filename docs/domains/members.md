# Domínio Members

Implementação: `apps/core-api/src/modules/members`. Decisões:
[ADR 0007](../adr/0007-members-e-vinculos-congregacionais.md) e
[ADR 0009](../adr/0009-pessoa-e-membro-a-partir-de-conta.md) (Pessoa e membro a partir de conta verificada) e
[ADR 0012](../adr/0012-perfil-da-pessoa.md) (Perfil da Pessoa).

## Linguagem ubíqua

| Termo             | Significado                                                           |
| ----------------- | --------------------------------------------------------------------- |
| Pessoa            | Cadastro completo de alguém, criado a partir de uma conta verificada. |
| Membro            | Pessoa que participa da comunidade; não guarda dados pessoais.        |
| Vínculo           | Participação do membro em uma congregação, com início e fim.          |
| Vínculo principal | A congregação de referência do membro; no máximo um ativo por vez.    |
| Vínculo aberto    | Vínculo PENDING ou ACTIVE.                                            |
| Arquivado         | Membro retirado das listas do dia a dia, preservado para histórico.   |

## Aggregates

### Person

- Campos: conta de origem (`accountId`, única), nome completo, sexo, data de nascimento, telefones
  1 e 2, e-mail principal (o de acesso da conta), e-mail secundário, endereço, links de redes
  sociais, foto e versão. Dependentes ficam para depois.
- Nasce somente na conversão de uma conta verificada, com os dados da conta.
- A própria pessoa edita o cadastro no Perfil (substituição completa, com `version`); o e-mail
  principal só muda pela troca do e-mail de acesso, confirmada no novo endereço.

### Member

- Campos: Pessoa (`personId`, única: uma Pessoa, um membro), situação e versão.
- Situações: nasce `ACTIVE`; `ACTIVE ⇄ INACTIVE`; `INACTIVE → ARCHIVED`; `ARCHIVED → INACTIVE`.
- Pessoa e membro nascem juntos, na mesma transação.

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
- Uma Pessoa por conta e um membro por Pessoa (restrições únicas): converter a mesma conta de novo
  devolve o mesmo membro.
- Endereço opcional; quando informado, exige logradouro, número, bairro, cidade, estado, CEP e país
  (no Brasil, CEP com 8 dígitos e UF válida). Links de redes sociais somente HTTPS do domínio da
  própria rede. Foto: JPEG, PNG ou WebP de até 10 MB, gravada como WebP quadrado de 512 px.

## Use Cases

| Use Case               | Rota da Core API (`/api/v1`)                                    |
| ---------------------- | --------------------------------------------------------------- |
| ListMembers (cursor)   | `GET /members?status&congregationId&search&cursor&limit`        |
| GetMember              | `GET /members/:id`                                              |
| EnrollMember           | `POST /members` (`{ accountId, fullName, email, phone }`, BFF)  |
| ChangeMemberStatus     | `POST /members/:id/{activate,deactivate,archive,restore}`       |
| ListMemberships        | `GET /members/:id/memberships` (histórico, com a congregação)   |
| RegisterMembership     | `POST /members/:id/memberships` (`{ congregationId, primary }`) |
| ChangeMembershipStatus | `POST /memberships/:id/{activate,deactivate}`                   |
| GetPerson              | `GET /people/:id` (com a URL da foto, válida por 1 h)           |
| UpdatePerson           | `PUT /people/:id` (cadastro completo, exceto e-mail principal)  |
| ChangePersonEmail      | `PUT /people/:id/email` (`{ email }`, após a troca na conta)    |
| RequestAvatarUpload    | `POST /people/:id/avatar/uploads` (`{ contentType }`)           |
| CompleteAvatarUpload   | `PUT /people/:id/avatar` (`{ uploadId }`)                       |
| RemoveAvatar           | `DELETE /people/:id/avatar`                                     |

Membros são devolvidos com os dados da Pessoa (`person`). `POST /members` responde `201` ao criar
Pessoa e membro e `200` com o mesmo membro quando a conta já foi convertida. O filtro
`congregationId` lista os membros com vínculo aberto na congregação; `search` busca um trecho do
nome da Pessoa sem diferenciar maiúsculas de minúsculas.

## Integração com Organization

Somente pelo contrato público `CongregationDirectory` (`modules/organization/public/`), traduzido
pela Anticorruption Layer `CongregationCatalog`. Sem chave estrangeira entre schemas.

## Autorização

Provisória no MVP, como em Organization: o BFF exige sessão com e-mail verificado. O acesso a dados
pessoais por papel, escopo e campo depende do contexto Authorization.
