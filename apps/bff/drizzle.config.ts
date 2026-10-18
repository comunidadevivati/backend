import { defineConfig } from 'drizzle-kit';

// Gera as migrations versionadas em ./drizzle; elas são aplicadas pelo BFF ao iniciar.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/auth/infrastructure/database/auth.schema.ts',
  out: './drizzle',
  schemaFilter: ['auth'],
  migrations: {
    schema: 'auth',
  },
});
