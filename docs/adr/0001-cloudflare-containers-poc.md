# ADR 0001 — Prova de conceito com Cloudflare Containers

- Status: Superseded por ADR 0002
- Data: 2026-10-14

## Contexto

O BFF e a Core API são aplicações NestJS/Fastify em Node.js 24. A arquitetura aprovada estabelece
Cloudflare Containers como runtime preferencial, condicionada a uma prova de conceito que valide
autenticação, dependências externas, comportamento operacional, custo e observabilidade.

## Proposta

Manter BFF e Core API como unidades de deploy independentes. Cada aplicação recebe:

- imagem OCI Linux/AMD64;
- Worker Cloudflare dedicado para roteamento e ciclo de vida;
- uma instância `basic` na fase inicial;
- filesystem tratado como efêmero;
- health check HTTP da própria aplicação;
- configuração e segredos injetados em runtime.

PostgreSQL, Redis, Keycloak e o Worker BullMQ permanecem fora dos Containers de BFF/Core API.

## Justificativa

A proposta preserva os limites arquiteturais existentes e permite validar o runtime pretendido sem
escolher prematuramente provedores externos ou o mecanismo definitivo de propagação de identidade.

## Consequências

- O repositório passa a produzir artefatos implantáveis na Cloudflare.
- O deploy exige Workers Paid, Containers, Docker e credenciais Cloudflare.
- O BFF continua dependente de Redis e Keycloak externos.
- Uma única instância é suficiente apenas para a prova de conceito.
- A adoção definitiva exige os critérios documentados em `docs/deployment/README.md`.

## Resultado

A publicação foi interrompida antes da validação remota porque Cloudflare Containers exige o plano
Workers Paid. Para preservar o requisito de custo zero do MVP, a proposta foi substituída pela
ADR 0002. Os artefatos específicos do runtime Cloudflare foram removidos do código ativo.

## Alternativas consideradas

- Executar NestJS diretamente no runtime Workers: descartado para a prova de conceito por exigir
  adaptação relevante do servidor e das dependências Node atuais.
- Hospedar todos os componentes em Containers: descartado porque bancos, Redis, Keycloak e BullMQ
  possuem requisitos de persistência ou execução contínua incompatíveis com essa topologia.
- Escolher outro provedor de containers imediatamente: não adotado, pois Cloudflare Containers já é
  a preferência arquitetural aprovada para avaliação.
