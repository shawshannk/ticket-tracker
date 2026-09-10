import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { loggerOptions } from './common/logging/logger.options';
import { getConfig } from './config/env';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';
import { TicketsModule } from './tickets/tickets.module';
import { UsersModule } from './users/users.module';

/**
 * The config is read through `getConfig()` rather than threaded in from `main.ts`, because a test
 * that builds this module directly never runs bootstrap. `main.ts` has already validated by the
 * time this evaluates, so the memoized value is returned and nothing can throw here.
 *
 * `APP_CONFIG` is exported so later modules inject it instead of reaching for `process.env`.
 */
export const APP_CONFIG = Symbol('APP_CONFIG');

const config = getConfig();

@Module({
  imports: [
    LoggerModule.forRoot(loggerOptions(config)),
    DbModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    TicketsModule,
  ],
  providers: [
    { provide: APP_CONFIG, useValue: config },
    // Registered here rather than in main.ts so both get DI, and so a test that builds the
    // module gets the same error contract the real server serves.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useValue: new TimeoutInterceptor(config.REQUEST_TIMEOUT_MS) },
  ],
  exports: [APP_CONFIG],
})
export class AppModule {}
