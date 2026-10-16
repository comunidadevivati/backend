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

COPY apps/bff ./apps/bff

RUN pnpm --filter @comvivati/bff build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV BFF_PORT=10000
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json ./apps/bff/package.json

RUN pnpm install --prod --frozen-lockfile --filter @comvivati/bff

COPY --from=build --chown=node:node /workspace/apps/bff/dist ./apps/bff/dist
COPY --chown=node:node apps/bff/drizzle ./apps/bff/drizzle

USER node

EXPOSE 10000

CMD ["node", "apps/bff/dist/main.js"]
