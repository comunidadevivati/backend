# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/bff/package.json ./apps/bff/package.json
COPY apps/core-api/package.json ./apps/core-api/package.json

RUN pnpm install --frozen-lockfile

COPY apps/core-api ./apps/core-api

RUN pnpm --filter @comvivati/core-api build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=10000
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

# jemalloc no lugar do malloc da glibc (recomendação do sharp): devolve a memória após cada foto
# processada. Com o malloc padrão, a fragmentação se acumulava a cada foto e levava o processo além
# dos 512 MB da instância free. O link deixa o caminho igual em qualquer arquitetura.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libjemalloc2 \
  && rm -rf /var/lib/apt/lists/* \
  && ln -s "/usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2" /usr/local/lib/libjemalloc.so.2
ENV LD_PRELOAD=/usr/local/lib/libjemalloc.so.2

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/core-api/package.json ./apps/core-api/package.json

RUN pnpm install --prod --frozen-lockfile --filter @comvivati/core-api

COPY --from=build --chown=node:node /workspace/apps/core-api/dist ./apps/core-api/dist
COPY --chown=node:node apps/core-api/drizzle ./apps/core-api/drizzle

USER node

EXPOSE 10000

CMD ["node", "apps/core-api/dist/main.js"]
