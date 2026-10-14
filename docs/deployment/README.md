# Deploy do Backend na Cloudflare

## 1. Escopo

Este documento descreve a prova de conceito de publicação do BFF e da Core API em Cloudflare
Containers. Cada aplicação possui imagem, Worker roteador, configuração Wrangler e ciclo de deploy
independentes.

O Worker BullMQ, PostgreSQL, Redis e Keycloak não fazem parte desses Containers:

- PostgreSQL e Redis devem ser serviços gerenciados externos, acessíveis com TLS.
- Keycloak deve executar em runtime contínuo externo e expor um issuer HTTPS.
- O Worker BullMQ deve executar em infraestrutura contínua complementar à Cloudflare.
- Dados persistentes não devem ser gravados no filesystem efêmero dos Containers.

## 2. Topologia da prova de conceito

```text
Frontend web
    |
    v
Worker comvivati-bff-poc
    |
    v
BFF Container :3000 ----> Keycloak HTTPS
    |                    -> Redis TLS
    v
Worker comvivati-core-api-poc
    |
    v
Core API Container :3001
```

A comunicação definitiva BFF → Core API e o provedor de cada serviço externo continuam decisões
arquiteturais pendentes. A prova de conceito não deve estabelecer esses contratos por conveniência.

## 3. Artefatos

| Aplicação | Imagem                     | Worker                               | Configuração                   |
| --------- | -------------------------- | ------------------------------------ | ------------------------------ |
| BFF       | `apps/bff/Dockerfile`      | `apps/bff/cloudflare/worker.ts`      | `apps/bff/wrangler.jsonc`      |
| Core API  | `apps/core-api/Dockerfile` | `apps/core-api/cloudflare/worker.ts` | `apps/core-api/wrangler.jsonc` |

As imagens usam Node.js 24, executam como usuário não privilegiado e são construídas a partir da
raiz do monorepo. O Wrangler publica as imagens no Cloudflare Registry durante o deploy.

## 4. Pré-requisitos

- plano Cloudflare Workers Paid com Containers habilitados;
- Docker compatível ativo para deploy local, ou execução pelo GitHub Actions;
- Node.js 24 e pnpm 12.10.1;
- API token limitado à conta de destino, com permissões de edição de Workers Scripts e Containers;
- `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_API_TOKEN` configurados fora do repositório;
- Redis externo com TLS;
- Keycloak externo com HTTPS e redirect URI do BFF registrada.

## 5. Segredos obrigatórios do BFF

O `wrangler.jsonc` exige os bindings abaixo antes do deploy:

| Nome                     | Conteúdo                                            |
| ------------------------ | --------------------------------------------------- |
| `BFF_BASE_URL`           | URL pública HTTPS do BFF                            |
| `BFF_OIDC_CALLBACK_URL`  | URL pública terminada em `/auth/callback`           |
| `WEB_BASE_URL`           | Origem HTTPS exata do frontend                      |
| `KEYCLOAK_ISSUER`        | Issuer HTTPS do realm                               |
| `KEYCLOAK_CLIENT_ID`     | Client ID do BFF                                    |
| `KEYCLOAK_CLIENT_SECRET` | Segredo do cliente confidencial                     |
| `COOKIE_SECRET`          | Valor aleatório com no mínimo 32 caracteres         |
| `SESSION_ENCRYPTION_KEY` | Chave Base64URL de 32 bytes, com 43 caracteres      |
| `REDIS_URL`              | URL do Redis externo, preferencialmente `rediss://` |

Os valores podem ser cadastrados interativamente com `wrangler secret put` ou em lote com
`wrangler secret bulk`. Arquivos contendo os valores não devem ser adicionados ao Git.

Exemplo de comando individual:

```bash
pnpm exec wrangler secret put COOKIE_SECRET --config apps/bff/wrangler.jsonc
```

## 6. Validação local

Instale as dependências e valide tipos, configurações e bundles:

```bash
pnpm install --frozen-lockfile
pnpm run cloudflare:typecheck
pnpm run cloudflare:check
```

Com Docker ativo, valide as duas imagens:

```bash
pnpm run container:build
```

O `cloudflare:check` usa `--containers-rollout=none`: ele valida e empacota os Workers, mas não
constrói nem publica imagens. A construção OCI é validada separadamente pelo comando acima e pelo
job `Container Images` do CI.

## 7. Publicação manual

Autentique o Wrangler e publique primeiro a Core API:

```bash
pnpm exec wrangler login
pnpm run cloudflare:deploy:core-api
```

Depois de cadastrar todos os secrets do BFF:

```bash
pnpm run cloudflare:deploy:bff
```

O primeiro provisionamento pode levar alguns minutos. Confirme os endpoints:

```text
https://comvivati-core-api-poc.<workers-subdomain>.workers.dev/api/v1/health
https://comvivati-bff-poc.<workers-subdomain>.workers.dev/health
```

Antes de validar o login, atualize no Keycloak a redirect URI exata informada em
`BFF_OIDC_CALLBACK_URL`.

## 8. Publicação pelo GitHub Actions

Crie o environment protegido `cloudflare-poc` no GitHub e adicione:

- `CLOUDFLARE_ACCOUNT_ID`;
- `CLOUDFLARE_API_TOKEN`.

Os secrets de runtime do BFF permanecem no Cloudflare, não no workflow. Execute manualmente o
workflow `Deploy Cloudflare PoC` e escolha `core-api` ou `bff`. Recomenda-se exigir aprovação do
environment antes de cada publicação.

## 9. Critérios para concluir a prova de conceito

- build Linux/AMD64 das duas imagens concluído;
- health checks públicos respondendo após cold start;
- login completo frontend → BFF → Keycloak → BFF → frontend;
- sessão criada e recuperada no Redis externo;
- logout com CSRF removendo sessão e cookie;
- comunicação BFF → Core API definida e validada sem headers de identidade arbitrários;
- logs sem tokens, cookies ou segredos;
- encerramento gracioso durante rollout;
- medição de cold start, latência e custo;
- teste de falha e recuperação de Redis e Keycloak;
- definição de capacidade e estratégia de múltiplas instâncias.

Até esses itens serem comprovados em ambiente remoto, o status permanece “PoC implantável”, não
“compatibilidade de produção aprovada”.
