# ADR 0002 — Infraestrutura gratuita para MVP e homologação

- Status: Accepted (Keycloak e Upstash Redis substituídos pelo
  [ADR 0003](0003-autenticacao-email-senha-postgresql.md))
- Data: 2026-10-14

## Contexto

A prova de conceito com Cloudflare Containers exige o plano Workers Paid. O requisito atual é
manter custo mensal zero durante MVP e homologação, aceitando cold starts, cotas e ausência de SLA.
O frontend já está publicado na Cloudflare e implementa um proxy de mesma origem para `/auth/*`.

## Decisão

- Manter o frontend no plano gratuito da Cloudflare.
- Publicar Core API, BFF e Keycloak como serviços web `free` no Render.
- Usar Neon Free como PostgreSQL persistente do Keycloak e, futuramente, da Core API.
- Usar Upstash Redis Free para as sessões do BFF.
- Conectar o Blueprint do Render à branch `main` e implantar apenas após os checks do CI.
- Postergar o deploy do Worker BullMQ, pois o consumidor exige execução contínua e não é compatível
  com a topologia gratuita serverless sem alteração arquitetural.

## Justificativa

O Render aceita os Dockerfiles existentes, integra-se ao GitHub e suspende os serviços gratuitos
ociosos. Neon e Upstash fornecem persistência externa sem gravar dados no filesystem efêmero dos
containers. A decisão preserva Keycloak, PostgreSQL e Redis já aprovados para a arquitetura.

## Consequências

- O primeiro acesso após inatividade pode apresentar cold start.
- As cotas gratuitas podem suspender serviços até o próximo ciclo.
- Core API, BFF e Keycloak compartilham a franquia mensal do workspace Render.
- Não há garantia de disponibilidade, backup ou suporte adequada à produção.
- O Keycloak deve usar PostgreSQL externo; seu filesystem não armazena estado persistente.
- Os 512 MB do Render Free ficam abaixo do dimensionamento mínimo recomendado pelo Keycloak; a
  configuração reduz heap e threads e deve ser tratada como experimental.
- O fluxo OIDC continua na origem do frontend por meio do proxy `/auth/*`.
- Os provedores definitivos de produção permanecem pendentes de avaliação.

## Alternativas consideradas

- Cloudflare Containers: descartado nesta etapa por exigir pagamento mínimo mensal.
- Google Cloud Run: não adotado por exigir conta de faturamento e permitir cobrança acima da cota.
- Render Postgres Free: descartado porque o banco expira após 30 dias.
- Executar BullMQ em serviço gratuito serverless: descartado porque requer processo contínuo.
