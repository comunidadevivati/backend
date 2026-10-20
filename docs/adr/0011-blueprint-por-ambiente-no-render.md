# ADR 0011 — Um Blueprint do Render por ambiente

- Status: Accepted (substitui o item "Blueprint conectado à branch `main`" do
  [ADR 0002](0002-infraestrutura-gratuita-mvp.md))
- Data: 2026-10-20

## Contexto

O ADR 0002 conectou um único Blueprint do Render à branch `main`, e o `render.yaml` passou a
descrever também os serviços de homologação (`*-hml`), cujo código é publicado a partir da branch
`homologation`. Com isso, o código da HML vem de `homologation`, mas a configuração da HML só muda
quando o `render.yaml` chega à `main`, ou seja, depois de já estar em produção. A galeria de fotos
(ADR 0010) expôs o problema: as variáveis novas da Core API só chegariam à HML depois da produção,
obrigando a cadastrá-las à mão para testar.

## Decisão

- Dois Blueprints no mesmo repositório, um por ambiente:
  - **Produção**: `render.yaml`, ligado à branch `main`, com `comvivati-core-api` e `comvivati-bff`;
  - **Homologação**: `render.homologation.yaml`, ligado à branch `homologation`, com
    `comvivati-core-api-hml` e `comvivati-bff-hml`.
- Cada serviço pertence a um único Blueprint. Os nomes dos serviços, os planos, a região e o
  `autoDeployTrigger: checksPass` não mudam.
- Toda mudança de configuração é feita nos dois arquivos na mesma branch de feature: o
  `render.homologation.yaml` é aplicado ao entrar em `homologation`, e o `render.yaml` ao ser
  promovido para `main`.

## Justificativa

Configuração e código seguem o mesmo caminho de promoção (feature → `homologation` → `main`), e a
HML valida a configuração antes da produção, como já faz com o código.

## Consequências

- Há dois arquivos para manter em sincronia; a diferença entre eles deve se limitar a nomes,
  branches, URLs e valores próprios de cada ambiente.
- A migração exige ordem: o `render.yaml` só com a produção precisa chegar à `main` (os serviços
  `*-hml` deixam o Blueprint antigo) antes de criar o Blueprint de homologação. O passo a passo está
  em [docs/deployment/README.md](../deployment/README.md).
- Se o Render recriar os serviços `*-hml` em vez de reaproveitá-los, o `CORE_API_TOKEN` da HML é
  gerado de novo (o BFF o lê do mesmo Blueprint) e os valores `sync: false` precisam ser informados
  outra vez.
