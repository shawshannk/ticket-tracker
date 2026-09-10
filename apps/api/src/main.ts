import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { assertImpersonationIsSafe } from './auth/dev-impersonation';
import { requestIdMiddleware } from './common/logging/request-id.middleware';
import { EnvValidationError, loadEnv } from './config/env';
import { initSentry } from './observability/sentry';

async function bootstrap() {
  // Before anything listens: a build that would honour X-Acting-User-Id in production must not
  // start at all. Failing here is the whole control — a runtime check could be missed.
  assertImpersonationIsSafe();

  // Same discipline, generalised (spec 11 §7). Every variable is validated once, here, so a
  // misconfiguration is a readable sentence at boot rather than a failure under load.
  const config = loadEnv();

  initSentry(config);

  // Imported only after validation succeeds: AppModule reads the config while it is being
  // defined, and a throw during module evaluation escapes as a raw stack trace that no handler
  // below can reformat.
  const { AppModule } = await import('./app.module');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Nest's own startup logs are buffered until the pino logger is installed below, so boot
    // output is in one format rather than two.
    bufferLogs: true,
    // We install our own JSON parser to enforce a body limit; Nest's default has none.
    bodyParser: false,
  });

  app.useLogger(app.get(Logger));

  // First in the chain: everything after this — logs, errors, jobs — is correlated by it.
  app.use(requestIdMiddleware);

  app.use(helmet());

  // `req.ip` is recorded on every `auth_events` row and is what the login rate limiter buckets
  // on. Behind a load balancer, without this, every request appears to come from the proxy —
  // which would let one abusive client exhaust the limit for everyone.
  app.set('trust proxy', 1);

  app.use(express.json({ limit: config.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: config.BODY_LIMIT }));

  // The refresh token arrives as a cookie; without this `req.cookies` is undefined.
  app.use(cookieParser());

  // The web app is served from its own origin (5173 in dev, a separate container in Compose),
  // so the API must opt in. `credentials: true` is required for the refresh cookie to travel at
  // all; note that a wildcard origin is rejected by browsers once credentials are enabled, so
  // WEB_ORIGIN must name real origins.
  app.enableCors({
    origin: config.webOrigins,
    allowedHeaders: ['content-type', 'authorization', 'x-acting-user-id', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // Off in production unless explicitly enabled: until M22 this published the entire API surface
  // at /api to anyone who asked.
  if (config.apiDocsEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Ticket Tracker API')
      .setDescription('Multi-project ticket/issue tracker API')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  // SIGTERM stops new connections and lets in-flight requests finish. Without it every deploy
  // severed open transactions mid-write.
  app.enableShutdownHooks();

  await app.listen(config.PORT);
}

bootstrap().catch((err) => {
  // A config failure must read as one line an operator can act on, not a stack trace — so it is
  // printed before anything else has a chance to reformat it.
  if (err instanceof EnvValidationError) {
    console.error(err.message);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
