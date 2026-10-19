import { defineConfig } from 'drizzle-kit';

// Gera as migrations versionadas em ./drizzle; elas são aplicadas pela Core API ao iniciar.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/modules/*/infrastructure/database/*.schema.ts',
  out: './drizzle',
  schemaFilter: ['organization'],
  migrations: {
    schema: 'core_api',
  },
});
