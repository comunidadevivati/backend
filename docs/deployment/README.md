# Deploy gratuito do backend para MVP e homologação

## 1. Escopo

Esta topologia mantém custo mensal zero enquanto o uso permanecer dentro das cotas gratuitas:

- frontend: Cloudflare Workers Static Assets;
- Core API e BFF: serviços web gratuitos no Render;
- PostgreSQL (usuários e sessões do BFF): Neon Free;
- CI: GitHub Actions;
- deploy: Render Blueprint conectado à branch `main` após os checks do CI.

Os serviços gratuitos possuem cold start, limites de uso e ausência de SLA. Esta configuração é
destinada somente a MVP e homologação, não a produção. A autenticação por e-mail e senha está
descrita no [ADR 0003](../adr/0003-autenticacao-email-senha-postgresql.md).

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

Crie um projeto gratuito no Neon e copie a connection string com pooling:

```text
postgresql://USUARIO:SENHA@HOST/DATABASE?sslmode=require
```

Esse valor será o secret `DATABASE_URL` do BFF no Render. Nunca adicione a URL ou as credenciais ao
Git.

## 5. Criar o Blueprint no Render

1. No Render, escolha **New > Blueprint**.
2. Conecte `https://github.com/comunidadevivati/backend`.
3. Selecione a branch `main` e o arquivo `render.yaml`.
4. Mantenha o plano `free` dos serviços.
5. Informe `DATABASE_URL` no BFF quando solicitado (`sync: false`).

O `COOKIE_SECRET` é gerado pelo próprio Render.

Se o Blueprint já existia com o serviço `comvivati-keycloak`, exclua esse serviço manualmente no
Dashboard após a sincronização e remova as variáveis antigas do BFF (`KEYCLOAK_*`,
`BFF_OIDC_CALLBACK_URL`, `SESSION_ENCRYPTION_KEY`, `REDIS_URL`). O banco Redis no Upstash também
pode ser excluído.

## 6. Criar usuários

Não há cadastro público. Crie cada usuário a partir de uma máquina com acesso ao banco:

```bash
DATABASE_URL='<connection string do Neon>' \
  pnpm --dir apps/bff user:create --email pessoa@exemplo.com --name "Nome da Pessoa"
```

A senha é solicitada sem eco no terminal (mínimo de 8 caracteres). O comando aplica as migrations
pendentes antes de inserir o usuário. Para uso não interativo, a senha pode ser informada na
variável `USER_PASSWORD`; não a registre no histórico do shell.

## 7. Conectar o frontend ao BFF

No projeto Cloudflare do frontend, cadastre o secret:

```text
BFF_ORIGIN=https://comvivati-bff.onrender.com
```

Depois, reimplante o frontend. Não coloque esse valor em uma variável `VITE_*`; o proxy é executado
no Worker e a aplicação continua consumindo caminhos relativos na mesma origem.

As variáveis públicas do BFF permanecem com a origem do frontend:

```text
BFF_BASE_URL=https://comunidade-viva-web.comvivati.workers.dev
WEB_BASE_URL=https://comunidade-viva-web.comvivati.workers.dev
```

## 8. Deploy automático

Cada serviço do Blueprint usa:

```yaml
branch: main
autoDeployTrigger: checksPass
```

Após um merge na `main`, o Render aguarda os checks do GitHub e publica os serviços afetados. O
Blueprint também é sincronizado quando `render.yaml` muda.

## 9. Validação

Valide primeiro os endpoints públicos:

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

Não considere a integração comprovada apenas com health checks ou testes unitários.

## 10. Limites conhecidos

- Serviços Render Free dormem após inatividade e podem demorar para responder no primeiro acesso.
- A franquia de horas é compartilhada pelos serviços gratuitos do workspace.
- O plano gratuito não oferece SLA adequado à produção.
- Atingir cotas pode suspender serviços ou bloquear comandos até o próximo ciclo.
- O login ainda não possui rate limiting, bloqueio por tentativas nem recuperação de senha.
- Alterações no nome público de qualquer serviço exigem atualizar URLs do BFF e do frontend.
