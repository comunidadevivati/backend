import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.schema.js';
import { HealthController } from './health/health.controller.js';
import { MembersModule } from './members/members.module.js';
import { OrganizationModule } from './organization/organization.module.js';
import { DatabaseModule } from './shared/infrastructure/database/database.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    AuthModule,
    OrganizationModule,
    MembersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
