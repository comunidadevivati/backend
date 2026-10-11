import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.schema.js';
import { HealthController } from './health/health.controller.js';
import { RedisModule } from './shared/infrastructure/redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    RedisModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
