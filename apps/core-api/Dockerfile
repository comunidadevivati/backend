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

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/core-api/package.json ./apps/core-api/package.json

RUN pnpm install --prod --frozen-lockfile --filter @comvivati/core-api

COPY --from=build --chown=node:node /workspace/apps/core-api/dist ./apps/core-api/dist

USER node

EXPOSE 10000

CMD ["node", "apps/core-api/dist/main.js"]
