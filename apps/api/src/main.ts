import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { assertImpersonationIsSafe } from './auth/dev-impersonation';

async function bootstrap() {
  // Before anything listens: a build that would honour X-Acting-User-Id in production must not
  // start at all. Failing here is the whole control — a runtime check could be missed.
  assertImpersonationIsSafe();

  const app = await NestFactory.create(AppModule);

  // The refresh token arrives as a cookie; without this `req.cookies` is undefined.
  app.use(cookieParser());

  // The web app is served from its own origin (5173 in dev, a separate container in Compose),
  // so the API must opt in. `credentials: true` is required for the refresh cookie to travel at
  // all; note that a wildcard origin is rejected by browsers once credentials are enabled, so
  // WEB_ORIGIN must name real origins.
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    allowedHeaders: ['content-type', 'authorization', 'x-acting-user-id'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Ticket Tracker API')
    .setDescription('Multi-project ticket/issue tracker API')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();
