import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export type Database = NodePgDatabase;

export interface DatabaseConnection {
  db: Database;
  pool: Pool;
}

// Mesmo caminho relativo a partir de src/ (tsx) e de dist/ (build): apps/bff/drizzle.
const migrationsFolder = fileURLToPath(new URL('../../../../drizzle', import.meta.url));

export const createDatabase = (connectionString: string): DatabaseConnection => {
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return { db: drizzle({ client: pool }), pool };
};

export const runMigrations = async (db: Database): Promise<void> => {
  await migrate(db, { migrationsFolder, migrationsSchema: 'auth' });
};
