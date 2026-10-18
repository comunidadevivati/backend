import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabase, runMigrations, type Database } from './database.js';
import type { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);

  private readonly pool: Pool;

  readonly db: Database;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const { db, pool } = createDatabase(this.configService.getOrThrow<string>('DATABASE_URL'));

    this.db = db;

    this.pool = pool;

    // Provedores gerenciados encerram conexões ociosas; sem este handler o processo cairia.
    this.pool.on('error', (error: Error) => {
      this.logger.error(`PostgreSQL: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await runMigrations(this.db);

    this.logger.log('Conexão com PostgreSQL estabelecida e migrations aplicadas.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
