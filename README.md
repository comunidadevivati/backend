# backend

Projeto Backend da Comunidade Viva - API + BFF

## Deploy gratuito de MVP e homologação

O backend possui um Blueprint do Render para publicar Core API e BFF em serviços web gratuitos.
PostgreSQL é provisionado no Neon Free e guarda usuários e sessões do login por e-mail e senha
([ADR 0003](docs/adr/0003-autenticacao-email-senha-postgresql.md)). A recuperação usa o Resend
([ADR 0004](docs/adr/0004-recuperacao-de-senha-com-resend.md)). O frontend permanece na Cloudflare e
encaminha `/auth/*` ao BFF para preservar a sessão na mesma origem.

Ambiente local: copie `.env.example` para `.env` (senha do PostgreSQL) e `apps/bff/.env.example`
para `apps/bff/.env.local`, rode `docker compose up -d postgres` e `pnpm dev:bff`. Para criar um
usuário: `pnpm --dir apps/bff user:create --email ... --name ...`. Para validar as mesmas imagens do
Render, use `docker compose --profile app up -d --build` (BFF em `localhost:3000` e Core API em
`localhost:3001`), sem o `pnpm dev:bff` rodando ao mesmo tempo.

Essa topologia aceita cold starts, limites de uso e ausência de SLA. Ela não representa uma
aprovação para produção. Consulte [docs/deployment/README.md](docs/deployment/README.md).
