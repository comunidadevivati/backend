import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { validateEnv } from './config/env.schema.js';
import { HealthController } from './health/health.controller.js';
import { MembersModule } from './modules/members/members.module.js';
import { OrganizationModule } from './modules/organization/organization.module.js';
import { DatabaseModule } from './shared/infrastructure/database/database.module.js';
import { ProblemDetailsFilter } from './shared/presentation/problem-details.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnv,
    }),
    DatabaseModule,
    OrganizationModule,
    MembersModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AppModule {}
