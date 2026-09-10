import * as Sentry from '@sentry/node';
import type { AppConfig } from '../config/env';
import { requestContext } from '../common/logging/request-context';

/**
 * Error tracking (spec 11 §8). Inert without `SENTRY_DSN`, so local runs and CI need no account
 * and no test ever ships an event.
 */
export function initSentry(config: AppConfig): boolean {
  if (!config.SENTRY_DSN) return false;

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,

    // Request bodies can carry a password on exactly the routes most likely to error.
    sendDefaultPii: false,

    beforeSend(event) {
      const ctx = requestContext.get();
      if (ctx) {
        event.tags = { ...event.tags, requestId: ctx.requestId };
        if (ctx.userId) event.user = { id: ctx.userId };
      }
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });

  return true;
}
