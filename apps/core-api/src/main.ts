import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import 'reflect-metadata';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      trustProxy: false,
    }),
  );

  app.setGlobalPrefix('api/v1');

  app.enableShutdownHooks();

  const port = app.get(ConfigService).getOrThrow<number>('PORT');

  await app.listen(port, '0.0.0.0');
};

await bootstrap();
