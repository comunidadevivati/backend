# backend

Projeto Backend da Comunidade Viva - API + BFF

## Deploy gratuito de MVP e homologação

O backend possui um Blueprint do Render para publicar Core API e BFF em serviços web gratuitos.
PostgreSQL é provisionado no Neon Free e guarda usuários e sessões do login por e-mail e senha
([ADR 0003](docs/adr/0003-autenticacao-email-senha-postgresql.md)). O frontend permanece na
Cloudflare e encaminha `/auth/*` ao BFF para preservar a sessão na mesma origem.

Ambiente local: `docker compose up -d postgres`, `DATABASE_URL` em `apps/bff/.env.local` e
`pnpm --dir apps/bff user:create --email ... --name ...` para criar um usuário.

Essa topologia aceita cold starts, limites de uso e ausência de SLA. Ela não representa uma
aprovação para produção. Consulte [docs/deployment/README.md](docs/deployment/README.md).
