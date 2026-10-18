# Deploy gratuito do backend para MVP e homologação

## 1. Escopo

Esta topologia mantém custo mensal zero enquanto o uso permanecer dentro das cotas gratuitas:

- frontend: Cloudflare Workers Static Assets;
- Core API e BFF: serviços web gratuitos no Render;
- PostgreSQL (usuários e sessões do BFF): Neon Free;
- CI: GitHub Actions;
- deploy: Render Blueprint; `homologation` publica HML e `main` publica produção, após os checks
  do CI.

### Ambientes

| Ambiente          | Branch         | Frontend                           | BFF (Render)        | Banco (Neon)            |
| ----------------- | -------------- | ---------------------------------- | ------------------- | ----------------------- |
| Produção (PRD)    | `main`         | `https://comvivaeficaz.com.br`     | `comvivati-bff`     | projeto `comvivati-prd` |
| Homologação (HML) | `homologation` | `https://hml.comvivaeficaz.com.br` | `comvivati-bff-hml` | projeto `comvivati-hml` |
| Desenvolvimento   | local          | `http://localhost:5173`            | local ou HML        | `compose.yaml` ou HML   |

Não há ambiente de desenvolvimento publicado. Cada ambiente publicado tem banco, `COOKIE_SECRET` e
`RESEND_API_KEY` próprios; dados de produção nunca são copiados para HML.

### Fluxo de branches

```text
feat/* | fix/* | hotfix/* | release/X.Y.Z | renovate/*  ──PR──>  homologation  ──PR──>  main
```

- Nenhum commit ou push direto em `homologation` ou `main`; toda alteração entra por PR aprovado.
- A `main` só aceita PRs da `homologation` (e o PR automático do Release Please). O CI recusa
  outras origens.
- PRs para `homologation` usam squash (título no padrão de commits). O PR `homologation` → `main`
  usa merge commit, para que a `homologation` continue ancestral da `main` e o Release Please leia
  os commits convencionais.
- Após cada release, sincronize a `main` de volta na `homologation` por PR (`main` → `homologation`).

As proteções são configuradas em rulesets do GitHub nas duas branches: exigir PR com aprovação,
exigir os checks do CI, bloquear push direto, force push e exclusão.

Os serviços gratuitos possuem cold start, limites de uso e ausência de SLA. Esta configuração é
destinada somente a MVP e homologação, não a produção. A autenticação por e-mail e senha está
descrita no [ADR 0003](../adr/0003-autenticacao-email-senha-postgresql.md), e a recuperação de senha
no [ADR 0004](../adr/0004-recuperacao-de-senha-com-resend.md).

## 2. Topologia

```text
Navegador
    |
    v
Frontend Cloudflare ── /auth/* ──> BFF Render ──> Neon PostgreSQL (schema auth)
                                      |
                                      v
                                  Core API
```

O frontend chama `/auth/*` na própria origem. Seu Worker encaminha essas rotas à origem pública do
BFF definida no secret `BFF_ORIGIN`. Isso permite que o navegador receba o cookie HttpOnly na
origem do frontend, sem expor o token de sessão ao JavaScript.

## 3. Artefatos

| Componente | Artefato                   |
| ---------- | -------------------------- |
| Blueprint  | `render.yaml`              |
| BFF        | `apps/bff/Dockerfile`      |
| Core API   | `apps/core-api/Dockerfile` |
| Migrations | `apps/bff/drizzle`         |

Os containers escutam na porta `10000`. O BFF aplica as migrations pendentes do schema `auth` ao
iniciar; se o banco estiver inacessível, o processo falha e o Render mantém a versão anterior.

## 4. Preparar PostgreSQL no Neon

Crie um projeto gratuito no Neon por ambiente (`comvivati-prd` e `comvivati-hml`), com PostgreSQL
18 e região AWS US East (N. Virginia), a mesma dos serviços no Render. Copie a connection string
com pooling de cada projeto:

```text
postgresql://USUARIO:SENHA@HOST/DATABASE?sslmode=require
```

Esse valor será o secret `DATABASE_URL` do BFF do respectivo ambiente no Render. Nunca adicione a
URL ou as credenciais ao Git.

## 5. Criar o Blueprint no Render

1. No Render, escolha **New > Blueprint**.
2. Conecte `https://github.com/comunidadevivati/backend`.
3. Selecione a branch `main` e o arquivo `render.yaml`.
4. Mantenha o plano `free` dos serviços.
5. Informe `DATABASE_URL` e `RESEND_API_KEY` de cada BFF (`comvivati-bff` e `comvivati-bff-hml`)
   quando solicitado (`sync: false`), usando o banco e a API key do respectivo ambiente.

O `COOKIE_SECRET` é gerado pelo próprio Render, um por serviço. O Blueprint é lido da `main`; os
serviços `*-hml` passam a existir quando o `render.yaml` com eles chegar à `main`, e a branch
`homologation` precisa existir no GitHub.

Se o Blueprint já existia com o serviço `comvivati-keycloak`, exclua esse serviço manualmente no
Dashboard após a sincronização e remova as variáveis antigas do BFF (`KEYCLOAK_*`,
`BFF_OIDC_CALLBACK_URL`, `SESSION_ENCRYPTION_KEY`, `REDIS_URL`). O banco Redis no Upstash também
pode ser excluído.

## 6. Criar usuários

Pessoas podem se cadastrar pela tela "Criar conta" do frontend (`POST /auth/register`). Para
criar usuários administrativamente, use o CLI a partir de uma máquina com acesso ao banco:

```bash
DATABASE_URL='<connection string do Neon>' \
  pnpm --dir apps/bff user:create --email pessoa@exemplo.com --name "Nome da Pessoa"
```

A senha é solicitada sem eco no terminal (mínimo de 8 caracteres). O comando aplica as migrations
pendentes antes de inserir o usuário. Para uso não interativo, a senha pode ser informada na
variável `USER_PASSWORD`; não a registre no histórico do shell.

## 7. Conectar o frontend ao BFF

O frontend possui um Worker por ambiente (`comunidade-viva-web` e `comunidade-viva-web-hml`). Em
cada um, cadastre o secret `BFF_ORIGIN` do respectivo ambiente:

```text
PRD: BFF_ORIGIN=https://comvivati-bff.onrender.com
HML: BFF_ORIGIN=https://comvivati-bff-hml.onrender.com
```

Depois, reimplante o frontend. Não coloque esse valor em uma variável `VITE_*`; o proxy é executado
no Worker e a aplicação continua consumindo caminhos relativos na mesma origem.

As variáveis públicas do BFF permanecem com a origem do frontend do mesmo ambiente:

```text
PRD: BFF_BASE_URL=WEB_BASE_URL=https://comvivaeficaz.com.br
HML: BFF_BASE_URL=WEB_BASE_URL=https://hml.comvivaeficaz.com.br
```

### Desenvolvimento local apontando para HML

O frontend local pode usar o BFF de HML sem subir BFF, Core API ou PostgreSQL locais. No
`.env.development.local` do frontend (não versionado):

```text
BFF_PROXY_TARGET=https://comvivati-bff-hml.onrender.com
```

O proxy do Vite repassa `/auth/*` ao BFF de HML; o cookie de sessão fica em `localhost`.

Também é possível rodar o BFF local com a `DATABASE_URL` de HML, mas **o BFF aplica as migrations
pendentes ao iniciar**: uma branch com migration nova alteraria o banco de HML antes do merge. Use
o BFF local com o banco de HML somente em branches sem migrations novas; para desenvolver
migrations, use o PostgreSQL do `compose.yaml`.

## 8. Deploy automático

Cada serviço do Blueprint usa `autoDeployTrigger: checksPass`, com `branch: main` em produção e
`branch: homologation` em HML.

Após um merge em uma dessas branches, o Render aguarda os checks do GitHub e publica os serviços do
respectivo ambiente. O Blueprint também é sincronizado quando `render.yaml` muda na `main`.

## 9. Validação

Valide primeiro os endpoints públicos (em HML, com o sufixo `-hml`):

```text
https://comvivati-core-api.onrender.com/api/v1/health
https://comvivati-bff.onrender.com/health
```

Depois valide o fluxo real:

1. Abra o frontend em uma janela anônima e acesse `/login`.
2. Informe uma senha incorreta e confirme a mensagem de credenciais inválidas.
3. Entre com um usuário criado pelo CLI e confirme o redirecionamento a `/dashboard`.
4. Confirme que `/auth/me` retorna a sessão sem expor o token e que o cookie é HttpOnly.
5. Execute logout, confirme a remoção do cookie e que `/auth/me` volta a responder 401.
6. Solicite a recuperação, abra o link recebido, redefina a senha e confirme que a senha anterior e
   as sessões existentes deixam de funcionar.

Não considere a integração comprovada apenas com health checks ou testes unitários.

## 10. Limites conhecidos

- Serviços Render Free dormem após inatividade e podem demorar para responder no primeiro acesso.
- A franquia de horas é compartilhada pelos serviços gratuitos do workspace.
- O plano gratuito não oferece SLA adequado à produção.
- Atingir cotas pode suspender serviços ou bloquear comandos até o próximo ciclo.
- Login e cadastro ainda não possuem rate limiting nem bloqueio por tentativas. A recuperação possui
  cooldown por conta, mas o limite adicional por IP/origem e a confirmação de e-mail ainda precisam
  ser tratados antes de produção.
- Alterações no nome público de qualquer serviço exigem atualizar URLs do BFF e do frontend.
