import { createRequire } from 'node:module';
import type { Params } from 'nestjs-pino';
import type { Request, Response } from 'express';
import type { AppConfig } from '../../config/env';
import { getRequestId } from './request-id.middleware';
import { requestContext } from './request-context';

/**
 * Pino configuration (spec 11 §1).
 *
 * The redaction list is the part that matters. R17 (spec 10) says credentials never reach a log,
 * and until now that held because reviewers noticed. Here it holds because pino removes the paths
 * mechanically, whatever a future handler decides to log.
 */
export function loggerOptions(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.LOG_LEVEL,

      // Pretty output is a development affordance only; production emits JSON for shipping.
      //
      // Availability is *checked*, not assumed from NODE_ENV. pino-pretty is a devDependency, so
      // it is absent from the production image — and Compose runs that image with
      // NODE_ENV=development, which made the container exit on boot with "unable to determine
      // transport target". A missing pretty-printer must degrade to JSON, never to a crash.
      transport:
        config.isProduction || !isResolvable('pino-pretty')
          ? undefined
          : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss.l' } },

      // Reuse the id the middleware already established, rather than pino generating a second one.
      genReqId: (req) => getRequestId(req),

      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.currentPassword',
          '*.newPassword',
          '*.token',
          '*.tokenHash',
          '*.refreshToken',
          '*.accessToken',
          'password',
          'currentPassword',
          'newPassword',
          'token',
          'tokenHash',
        ],
        censor: '[redacted]',
      },

      customProps: () => {
        const ctx = requestContext.get();
        return { userId: ctx?.userId ?? null, projectId: ctx?.projectId ?? null };
      },

      // The default serializers log every header and both full bodies; that is how a credential
      // ends up in a log despite a redaction list. Log only what an operator actually needs.
      serializers: {
        req: (req: Request & { id?: string }) => ({
          id: req.id,
          method: req.method,
          path: (req as unknown as { url: string }).url,
          ip: req.ip,
        }),
        res: (res: Response) => ({ statusCode: res.statusCode }),
      },

      customSuccessMessage: (req, res) =>
        `${(req as Request).method} ${(req as unknown as { url: string }).url} ${res.statusCode}`,
      customErrorMessage: (req, res) =>
        `${(req as Request).method} ${(req as unknown as { url: string }).url} ${res.statusCode}`,

      customAttributeKeys: { responseTime: 'durationMs', reqId: 'requestId' },

      // A health probe every few seconds would otherwise dominate the log volume.
      autoLogging: {
        ignore: (req) => {
          const url = (req as unknown as { url?: string }).url ?? '';
          return url.startsWith('/health');
        },
      },

      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    },
  };
}

function isResolvable(moduleName: string): boolean {
  try {
    createRequire(__filename).resolve(moduleName);
    return true;
  } catch {
    return false;
  }
}
