import cookie from '@fastify/cookie';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import 'reflect-metadata';

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  const config = app.get(ConfigService);

  const port = config.getOrThrow<number>('BFF_PORT');

  await app.register(cookie, {
    secret: config.getOrThrow<string>('COOKIE_SECRET'),
  });

  app.enableShutdownHooks();

  await app.listen(port, '127.0.0.1');
};

await bootstrap();
