import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  private readonly client: RedisClientType;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    this.client = createClient({
      url: this.configService.getOrThrow<string>('REDIS_URL'),
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          if (retries >= 5) {
            return false;
          }

          return Math.min(retries * 200, 2000);
        },
      },
    });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis: ${error.message}`);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();

    this.logger.log('Conexão com Redis estabelecida.');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.close();
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }
}
