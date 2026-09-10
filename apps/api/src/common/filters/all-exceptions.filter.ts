import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody, ApiErrorDetail, ErrorCode } from '@ticket-tracker/shared';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { getRequestId } from '../logging/request-id.middleware';
import { isUniqueViolation } from '../is-unique-violation';

/**
 * The single exit for every error the API produces (spec 11 §3).
 *
 * Two rules govern everything below:
 *
 * 1. **Nothing internal escapes.** Driver text, SQL fragments and stack frames are logged with
 *    the requestId and never written to the response. Before this filter, an unhandled Drizzle
 *    error surfaced as a raw postgres message — which names columns and constraints to anyone
 *    who can provoke it.
 * 2. **One shape, always.** Nest's own exceptions serialise three different ways (a string, a
 *    `{message, error, statusCode}` object, or whatever an author passed). The web app had to
 *    guess. Here every branch converges on `ApiErrorBody`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const requestId = getRequestId(request);

    // Terminus reports its own body — `{ status, info, error, details }` — and a probe reads it
    // to find out *which* dependency is down. Rewriting that into the API error envelope would
    // throw away the only useful part, so a health report passes through as it is. It is the one
    // documented exception to "one shape, always", and it is not a client-facing API response.
    const healthReport = readHealthReport(exception);
    if (healthReport) {
      response.status((exception as HttpException).getStatus()).json(healthReport);
      return;
    }

    const { status, code, message, details } = this.translate(exception);

    // A 5xx is our bug and gets the stack; a 4xx is the caller's and would be noise at error
    // level. Both carry the requestId, which is the only thing tying them to the response.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { requestId, err: exception, path: request.url, method: request.method },
        `Unhandled error on ${request.method} ${request.url}`,
      );
    } else {
      this.logger.warn(
        { requestId, code, status, path: request.url, method: request.method },
        message,
      );
    }

    const body: ApiErrorBody = {
      error: { code, message, requestId, ...(details ? { details } : {}) },
    };

    response.status(status).json(body);
  }

  private translate(exception: unknown): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  } {
    // Zod first: the validation pipe rethrows the ZodError itself so the issue list survives
    // intact rather than being flattened into a string by an exception constructor.
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: exception.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      };
    }

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }

    // Errors thrown by the body parser and other Express middleware are `http-errors` objects,
    // not HttpExceptions, so they would otherwise land as a 500 — an oversize body reported as
    // "something went wrong" tells the caller nothing about what to change. Their own messages
    // are not reused: a JSON parse error quotes the offending fragment of the request back.
    const middlewareStatus = readHttpErrorStatus(exception);
    if (middlewareStatus === HttpStatus.PAYLOAD_TOO_LARGE) {
      return {
        status: middlewareStatus,
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body is too large.',
      };
    }
    if (middlewareStatus === HttpStatus.BAD_REQUEST) {
      return {
        status: middlewareStatus,
        code: 'VALIDATION_FAILED',
        message: 'Request body could not be parsed.',
      };
    }

    // A unique violation that no handler caught. Handlers that want a specific message still
    // catch it themselves (`create-user`, `create-project`, `add-member`); this is the net that
    // stops the ones nobody anticipated from becoming a 500 full of constraint names.
    if (isUniqueViolation(exception)) {
      return {
        status: HttpStatus.CONFLICT,
        code: 'CONFLICT',
        message: 'That value is already taken.',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL',
      message: 'Something went wrong. Quote the request id if you report this.',
    };
  }

  private fromHttpException(exception: HttpException): {
    status: number;
    code: ErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  } {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL' : 'UNPROCESSABLE');

    // The request timeout (spec 11 §5) is the one 5xx a caller can act on, so it keeps its
    // message; it contains nothing internal.
    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      return { status, code, message: exception.message || 'The request took too long.' };
    }

    // Every other 5xx HttpException is ours to hide: `getResponse()` on one of these often
    // carries whatever a library put there.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return { status, code, message: 'Something went wrong. Quote the request id if you report this.' };
    }

    if (typeof payload === 'string') {
      return { status, code, message: payload };
    }

    const record = payload as Record<string, unknown>;
    const rawMessage = record.message;
    const message =
      typeof rawMessage === 'string'
        ? rawMessage
        : Array.isArray(rawMessage) && rawMessage.every((m) => typeof m === 'string')
          ? rawMessage.join('; ')
          : exception.message;

    // Pre-M22 handlers threw `BadRequestException({ message, issues })`. Keep reading `issues`
    // so those call sites did not all have to change in this module — they now land in `details`.
    const issues = record.issues ?? record.details;
    const details = Array.isArray(issues)
      ? issues
          .filter((i): i is { path?: unknown; message?: unknown } => typeof i === 'object' && i !== null)
          .map((i) => ({
            path: typeof i.path === 'string' ? i.path : '',
            message: typeof i.message === 'string' ? i.message : '',
          }))
      : undefined;

    return { status, code, message, ...(details?.length ? { details } : {}) };
  }
}

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_FAILED',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.REQUEST_TIMEOUT]: 'TIMEOUT',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'TIMEOUT',
};

/**
 * A Terminus health-check failure, or null for anything else. Identified by the shape of its
 * payload rather than by the request path, so it holds wherever a health check is mounted.
 */
function readHealthReport(exception: unknown): Record<string, unknown> | null {
  if (!(exception instanceof HttpException)) return null;
  if (exception.getStatus() !== HttpStatus.SERVICE_UNAVAILABLE) return null;

  const payload = exception.getResponse();
  if (typeof payload !== 'object' || payload === null) return null;

  const record = payload as Record<string, unknown>;
  return 'status' in record && 'details' in record ? record : null;
}

/**
 * The status off an `http-errors`-style error (what Express middleware throws), or null. Only
 * `expose: true` errors are honoured — that flag is the library's own marker for "safe to tell
 * the client", and anything else is an internal fault that must stay a 500.
 */
function readHttpErrorStatus(exception: unknown): number | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const err = exception as { status?: unknown; statusCode?: unknown; expose?: unknown };
  if (err.expose !== true) return null;

  const status = typeof err.status === 'number' ? err.status : err.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}
