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

  app.enableCors({
    origin: new URL(config.getOrThrow<string>('WEB_BASE_URL')).origin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Content-Type', 'X-CSRF-Token'],
  });

  app.enableShutdownHooks();

  await app.listen(port, '0.0.0.0');
};

await bootstrap();
