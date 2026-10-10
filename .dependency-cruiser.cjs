/**
 * Comunidade Viva e Eficaz
 * Regras obrigatórias de dependências arquiteturais.
 *
 * Todas as violações com severity: 'error'
 * devem bloquear o pipeline de qualidade.
 */

const boundedContexts = ['organization', 'identity', 'authorization', 'members'];

const applications = ['core-api', 'bff', 'worker'];

const contextIsolationRules = boundedContexts.map((context) => ({
  name: `no-cross-context-internal-imports-${context}`,
  comment: `O contexto ${context} só pode importar contratos públicos de outros contextos.`,
  severity: 'error',
  from: {
    path: `^apps/core-api/src/modules/${context}/`,
  },
  to: {
    path: `^apps/core-api/src/modules/(?!${context}/)[^/]+/(?!public/)`,
  },
}));

const applicationIsolationRules = applications.map((application) => ({
  name: `no-cross-app-internal-imports-${application}`,
  comment: `A aplicação ${application} não pode importar arquivos internos de outras aplicações.`,
  severity: 'error',
  from: {
    path: `^apps/${application}/`,
  },
  to: {
    path: `^apps/(?!${application}/)[^/]+/`,
  },
}));

module.exports = {
  forbidden: [
    {
      name: 'no-circular-dependencies',
      comment: 'Dependências circulares são proibidas em toda a arquitetura.',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-unresolved-dependencies',
      comment: 'Imports não resolvidos devem ser corrigidos.',
      severity: 'error',
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
    {
      name: 'no-domain-to-outer-layers',
      comment: 'Domain não pode depender de Application, Infrastructure ou Presentation.',
      severity: 'error',
      from: {
        path: '^apps/core-api/src/modules/[^/]+/domain/',
      },
      to: {
        path: '^apps/core-api/src/modules/[^/]+/(application|infrastructure|presentation)/',
      },
    },
    {
      name: 'no-application-to-outer-layers',
      comment: 'Application não pode depender de Infrastructure ou Presentation.',
      severity: 'error',
      from: {
        path: '^apps/core-api/src/modules/[^/]+/application/',
      },
      to: {
        path: '^apps/core-api/src/modules/[^/]+/(infrastructure|presentation)/',
      },
    },
    {
      name: 'no-frameworks-in-domain',
      comment: 'Domain não pode depender de frameworks ou infraestrutura externa.',
      severity: 'error',
      from: {
        path: '^apps/core-api/src/modules/[^/]+/domain/',
      },
      to: {
        path: 'node_modules/(@nestjs/|@fastify/|fastify/|drizzle-orm/|drizzle-kit/|@keycloak/|bullmq/|ioredis/|pg/)',
      },
    },
    {
      name: 'no-node-builtins-in-domain',
      comment: 'Domain não pode importar módulos nativos do Node.js.',
      severity: 'error',
      from: {
        path: '^apps/core-api/src/modules/[^/]+/domain/',
      },
      to: {
        dependencyTypes: ['core'],
      },
    },
    {
      name: 'no-frameworks-in-application',
      comment: 'Application não pode depender diretamente de frameworks ou infraestrutura.',
      severity: 'error',
      from: {
        path: '^apps/core-api/src/modules/[^/]+/application/',
      },
      to: {
        path: 'node_modules/(@nestjs/|@fastify/|fastify/|drizzle-orm/|drizzle-kit/|@keycloak/|bullmq/|ioredis/|pg/)',
      },
    },
    {
      name: 'no-packages-to-apps',
      comment: 'Pacotes compartilhados não podem depender de aplicações.',
      severity: 'error',
      from: {
        path: '^packages/',
      },
      to: {
        path: '^apps/',
      },
    },

    ...contextIsolationRules,
    ...applicationIsolationRules,
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
  },
};
