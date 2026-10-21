# Deploy gratuito do backend para MVP e homologação

## 1. Escopo

Esta topologia mantém custo mensal zero enquanto o uso permanecer dentro das cotas gratuitas:

- frontend: Cloudflare Workers Static Assets;
- Core API e BFF: serviços web gratuitos no Render;
- PostgreSQL (usuários e sessões do BFF): Neon Free;
- CI: GitHub Actions;
- deploy: um Render Blueprint por ambiente ([ADR 0011](../adr/0011-blueprint-por-ambiente-no-render.md));
  `homologation` publica HML e `main` publica produção, após os checks do CI.

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
- `main` e `homologation` só aceitam **merge commit** (rulesets), inclusive no PR de release
  mesclado pelo Release Please: o histórico das duas branches não diverge e o Release Please lê os
  commits convencionais de cada feature. Os commits das branches de feature seguem o padrão de
  commits do projeto.
- Após cada release, sincronize a `main` de volta na `homologation` por PR (`main` →
  `homologation`).

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
Frontend Cloudflare ── /auth/*, /api/* ──> BFF Render ──> Neon PostgreSQL (schema auth)
                                               |
                                               | Bearer CORE_API_TOKEN
                                               v
                                           Core API ──> Neon PostgreSQL (schema organization)
```

BFF e Core API de um ambiente usam o mesmo projeto Neon, cada um com seus schemas. A Core API exige
o `CORE_API_TOKEN` em todas as rotas, exceto o health check
([ADR 0006](../adr/0006-organization-e-integracao-bff-core-api.md)).

O frontend chama `/auth/*` na própria origem. Seu Worker encaminha essas rotas à origem pública do
BFF definida no secret `BFF_ORIGIN`. Isso permite que o navegador receba o cookie HttpOnly na
origem do frontend, sem expor o token de sessão ao JavaScript.

## 3. Artefatos

| Componente | Artefato                                                                             |
| ---------- | ------------------------------------------------------------------------------------ |
| Blueprints | `render.yaml` (produção, `main`) e `render.homologation.yaml` (HML, `homologation`)  |
| BFF        | `apps/bff/Dockerfile`                                                                |
| Core API   | `apps/core-api/Dockerfile`                                                           |
| Migrations | `apps/bff/drizzle` (schema `auth`) e `apps/core-api/drizzle` (schema `organization`) |

Os containers escutam na porta `10000`. BFF e Core API aplicam as próprias migrations pendentes ao
iniciar; se o banco estiver inacessível, o processo falha e o Render mantém a versão anterior. A
migration `0001_matriz_e_sede` da Core API cria a Matriz e a congregação Sede.

## 4. Preparar PostgreSQL no Neon

Crie um projeto gratuito no Neon por ambiente (`comvivati-prd` e `comvivati-hml`), com PostgreSQL
18 e região AWS US East (N. Virginia), a mesma dos serviços no Render. Copie a connection string
com pooling de cada projeto:

```text
postgresql://USUARIO:SENHA@HOST/DATABASE?sslmode=require
```

Esse valor será o secret `DATABASE_URL` do BFF do respectivo ambiente no Render. Nunca adicione a
URL ou as credenciais ao Git.

## 5. Criar os Blueprints no Render

Cada ambiente tem o próprio Blueprint ([ADR 0011](../adr/0011-blueprint-por-ambiente-no-render.md)):

| Blueprint               | Branch         | Arquivo                    | Serviços                                      |
| ----------------------- | -------------- | -------------------------- | --------------------------------------------- |
| `comvivati-backend`     | `main`         | `render.yaml`              | `comvivati-core-api`, `comvivati-bff`         |
| `comvivati-backend-hml` | `homologation` | `render.homologation.yaml` | `comvivati-core-api-hml`, `comvivati-bff-hml` |

Para cada um:

1. No Render, escolha **New > Blueprint**.
2. Conecte `https://github.com/comunidadevivati/backend`.
3. Selecione a branch e o arquivo da tabela (em **Blueprint Path**).
4. Mantenha o plano `free` dos serviços.
5. Informe `DATABASE_URL` e `RESEND_API_KEY` do BFF quando solicitado (`sync: false`), usando o
   banco e a API key do ambiente.
6. Informe também o `DATABASE_URL` da Core API, com a mesma connection string do BFF do ambiente, e
   as credenciais do R2 (seção 9.1).

O `COOKIE_SECRET` é gerado pelo próprio Render, um por serviço. O `CORE_API_TOKEN` é gerado no
serviço da Core API e lido pelo BFF do mesmo ambiente (`fromService`, por isso os dois serviços de
um ambiente ficam no mesmo Blueprint); o BFF recebe a origem pública da Core API em `CORE_API_URL`.
Mudanças de configuração devem ser feitas nos dois arquivos na mesma branch de feature: a HML as
recebe ao entrar em `homologation`, e a produção ao ser promovida para `main`.

### Migração do Blueprint único (uma vez)

Até o ADR 0011, o Blueprint `comvivati-backend` (na `main`) gerenciava os quatro serviços. Um
serviço só pode pertencer a um Blueprint, então a ordem importa:

1. Antes do merge, garanta que as variáveis `sync: false` dos serviços `*-hml` estejam preenchidas
   no Dashboard (elas continuam no serviço).
2. Faça o merge em `homologation` e depois promova para `main`. Ao sincronizar o `render.yaml` só
   com a produção, os serviços `*-hml` deixam de ser gerenciados pelo Blueprint `comvivati-backend`.
   Se o Render pedir confirmação para **excluir** os serviços removidos do arquivo, não confirme: eles
   devem ser apenas desvinculados.
3. Crie o Blueprint `comvivati-backend-hml` (branch `homologation`, arquivo
   `render.homologation.yaml`). Na revisão antes de aplicar, confira se o Render vai reaproveitar os
   serviços `comvivati-core-api-hml` e `comvivati-bff-hml` existentes. Se ele for criar serviços
   novos com os mesmos nomes, cancele e exclua os antigos primeiro; nesse caso, informe outra vez os
   valores `sync: false` (o `CORE_API_TOKEN` da HML é gerado de novo).
4. Confirme o health check dos serviços de HML (seção 9).

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

Cada serviço usa `autoDeployTrigger: checksPass`, com `branch: main` em produção e
`branch: homologation` em HML.

Após um merge em uma dessas branches, o Render aguarda os checks do GitHub e publica os serviços do
respectivo ambiente. Cada Blueprint também é sincronizado quando o seu arquivo muda na sua branch
(`render.yaml` na `main`, `render.homologation.yaml` na `homologation`).

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

## 9.1 Armazenamento de fotos no Cloudflare R2 (galeria, ADR 0010)

Sem estas etapas a galeria fica desligada (`MEDIA_STORAGE=disabled`, envios respondem `503`).
HML e produção usam **um único bucket**, cada um na sua pasta (`hml/` e `prod/`), porque a cota
gratuita de 10 GB é da conta. No painel do Cloudflare:

1. Criar o bucket `comunidade-viva-media`, **sem** domínio público nem acesso `r2.dev` por
   enquanto. Buckets criados para o modelo anterior (`-private`/`-public`) podem ser apagados se
   estiverem vazios.
2. Em CORS do bucket, liberar `PUT` e `GET` com o cabeçalho `Content-Type` somente para as
   origens do frontend (`https://comvivaeficaz.com.br` e `https://hml.comvivaeficaz.com.br`).
3. Em ciclo de vida (Object lifecycle rules), apagar após 1 dia os objetos dos prefixos
   `prod/gallery/uploads/` e `hml/gallery/uploads/` (envios abandonados), uma regra por prefixo.
4. Criar um token de API do R2 com permissão de leitura e escrita somente nesse bucket (o R2 não
   restringe por pasta; ver as consequências no ADR 0010).
5. Os Blueprints (`render.yaml` e `render.homologation.yaml`) já definem `MEDIA_STORAGE=s3`, `MEDIA_S3_REGION=auto`,
   `MEDIA_BUCKET=comunidade-viva-media` e `MEDIA_KEY_PREFIX` (`prod` ou `hml`). No serviço da Core API
   de cada ambiente, preencher no painel `MEDIA_S3_ENDPOINT=https://<id-da-conta>.r2.cloudflarestorage.com`
   (sem o nome do bucket), `MEDIA_S3_ACCESS_KEY_ID` e `MEDIA_S3_SECRET_ACCESS_KEY` **antes** do deploy:
   sem eles a Core API recusa iniciar.

Os domínios públicos (`media.comvivaeficaz.com.br` e `media-hml.comvivaeficaz.com.br`, ligados ao
mesmo bucket), a regra do WAF que restringe cada um a `/{pasta}/gallery/public/` e o token de purge
da CDN entram com a etapa de publicação. Com o domínio e a regra do WAF prontos, preencher no
serviço da Core API de cada ambiente, as três juntas:

- `MEDIA_PUBLIC_BASE_URL`: `https://media.comvivaeficaz.com.br` (produção) ou
  `https://media-hml.comvivaeficaz.com.br` (HML), sem barra final;
- `MEDIA_CDN_ZONE_ID`: ID da zona `comvivaeficaz.com.br`;
- `MEDIA_CDN_PURGE_TOKEN`: token da API do Cloudflare com permissão somente de _Cache Purge_ na zona.

Sem elas a publicação funciona, mas fotos despublicadas não saem do cache da CDN.

## 10. Limites conhecidos

- Serviços Render Free dormem após cerca de 15 minutos sem uso e levam de 30 a 60 segundos para
  voltar. Para o primeiro acesso esperar em vez de falhar: o BFF espera a Core API por até 60 s
  (`CORE_API_TIMEOUT_MS`) e a acorda assim que ele mesmo sobe, e o frontend espera até 70 s e avisa
  "Conectando ao servidor…". Manter os serviços acordados com pings externos não é viável no free:
  a franquia de 750 horas por mês do workspace só cobre um serviço ligado o mês inteiro.
- A franquia de horas é compartilhada pelos serviços gratuitos do workspace.
- O plano gratuito não oferece SLA adequado à produção.
- Atingir cotas pode suspender serviços ou bloquear comandos até o próximo ciclo.
- Login e cadastro ainda não possuem rate limiting nem bloqueio por tentativas. A recuperação possui
  cooldown por conta, mas o limite adicional por IP/origem e a confirmação de e-mail ainda precisam
  ser tratados antes de produção.
- Alterações no nome público de qualquer serviço exigem atualizar URLs do BFF e do frontend.
- O processamento de fotos roda na própria Core API, uma foto por vez; no Render Free cada foto pode
  levar de 15 a 20 segundos, e a cota gratuita do R2 (10 GB) comporta da ordem de 3.000 a 5.000
  fotos.
