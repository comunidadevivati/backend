# backend

Projeto Backend da Comunidade Viva - API + BFF

## Deploy gratuito de MVP e homologação

O backend possui um Blueprint do Render para publicar Core API, BFF e Keycloak em serviços web
gratuitos. PostgreSQL é provisionado no Neon Free, e Redis no Upstash Free. O frontend permanece
na Cloudflare e encaminha `/auth/*` ao BFF para preservar a sessão na mesma origem.

Essa topologia aceita cold starts, limites de uso e ausência de SLA. Ela não representa uma
aprovação para produção. Consulte [docs/deployment/README.md](docs/deployment/README.md).
