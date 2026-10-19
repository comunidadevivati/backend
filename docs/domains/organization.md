# Domínio Organization

Implementação: `apps/core-api/src/modules/organization`. Decisões: [ADR 0006](../adr/0006-organization-e-integracao-bff-core-api.md).

## Linguagem ubíqua

| Termo                | Significado                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Organização (Matriz) | A instituição Igreja Evangélica Viva e Eficaz; raiz (nível 0) da hierarquia. Existe só uma. |
| Congregação          | Igreja local vinculada à organização.                                                       |
| Sede                 | A congregação principal (`headquarters: true`); no máximo uma por organização.              |
| Código institucional | Identificador estável da congregação (ex.: `SEDE`). Não muda após o registro.               |

## Aggregates

### Organization

- Campos: nome empresarial (`legalName`), nome fantasia (`tradeName`), CNPJ, endereço, telefone,
  e-mail, situação e versão.
- Situações: `ACTIVE` ⇄ `INACTIVE`.
- Criada somente pela migration inicial; não há criação nem exclusão pela API.

### Congregation

- Campos: código, nome, CNPJ (opcional), endereço, telefone e e-mail (opcionais), Sede, situação e
  versão.
- Situações: nasce `DRAFT`; `DRAFT | INACTIVE → ACTIVE` (ativação/reativação); `ACTIVE → INACTIVE`.
- Referencia a organização pelo ID.

## Invariantes

- CNPJ com 14 dígitos e dígitos verificadores válidos (aceita máscara na entrada).
- CEP com 8 dígitos, UF brasileira, telefone com DDD (fixo com 10 dígitos ou celular com 11).
- E-mail e código institucional normalizados (minúsculas e maiúsculas, respectivamente).
- Código institucional único (`2–20` caracteres: letras, números e hífen interno).
- Uma congregação só é registrada ou ativada com a organização `ACTIVE`; inativar continua
  permitido.
- Toda alteração exige a versão lida (concorrência otimista).

## Use Cases

| Use Case                   | Rota da Core API (`/api/v1`)                    |
| -------------------------- | ----------------------------------------------- |
| GetOrganization            | `GET /organization`                             |
| UpdateOrganization         | `PATCH /organization`                           |
| ChangeOrganizationStatus   | `POST /organization/{activate,deactivate}`      |
| ListCongregations (cursor) | `GET /congregations?status&cursor&limit`        |
| GetCongregation            | `GET /congregations/:id`                        |
| RegisterCongregation       | `POST /congregations`                           |
| UpdateCongregation         | `PATCH /congregations/:id`                      |
| ChangeCongregationStatus   | `POST /congregations/:id/{activate,deactivate}` |

## Autorização

Provisória no MVP: o BFF exige sessão com e-mail verificado. Papéis e escopos (VISITANTE, ADMIN por
congregação, SUPER na organização) serão definidos no contexto Authorization.

## Dados iniciais

| Registro      | ID                                     | Situação |
| ------------- | -------------------------------------- | -------- |
| Matriz        | `01a14f8e-8ea4-7f34-ad19-0e85d0e1237c` | ACTIVE   |
| Sede (`SEDE`) | `01a14f8e-8ea5-7368-af3f-f594815a5aba` | ACTIVE   |

Ambos com CNPJ 14.158.325/0001-01, Av. Roseira, 1684, Parque Residencial dos Girassóis, Campo
Grande/MS, CEP 79091-848, telefone (67) 99255-0858 e e-mail comvivati@gmail.com.
