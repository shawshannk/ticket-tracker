/**
 * The API's error contract (spec 11 §3).
 *
 * Every non-2xx response the API produces has exactly this shape — there is no second format
 * and no bare-string body anywhere. The web app branches on `code`, never on `message`: the
 * message is English prose written for a human and may be reworded at any time, while a code is
 * a promise. Adding a case means adding to `ERROR_CODES`, not inventing a new envelope.
 */
export const ERROR_CODES = [
  /** Request body/params failed a Zod schema. `details` carries the issue list. */
  'VALIDATION_FAILED',
  /** No credentials, or credentials that no longer verify. */
  'UNAUTHENTICATED',
  /** Authenticated, but the role/ownership rules say no (spec 10 §3). */
  'FORBIDDEN',
  /** The resource does not exist — or exists and the caller may not know that (spec 10 §3.2). */
  'NOT_FOUND',
  /** A unique constraint rejected the write: duplicate email, project key, membership row. */
  'CONFLICT',
  /** A rule in `ticket-rules.ts` or a handler refused the operation. */
  'UNPROCESSABLE',
  /** Throttled — login rate limit (spec 10 §5) or the global limiter. */
  'RATE_LIMITED',
  /** The request exceeded `REQUEST_TIMEOUT_MS` (spec 11 §5). */
  'TIMEOUT',
  /** The request body exceeded `BODY_LIMIT` (spec 11 §5). */
  'PAYLOAD_TOO_LARGE',
  /** Anything unrecognised. The real cause is logged with the requestId, never returned. */
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorDetail {
  /** Dotted path into the request body, e.g. `title` or `labels.0`. */
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    /** Safe to render to a user as-is. Never contains SQL, stack frames or driver text. */
    message: string;
    /**
     * The id echoed in the `x-request-id` response header and stamped on every log line for
     * this request. This is what turns a user's screenshot into a log query, so it is present
     * on every error, including a 500 whose message is deliberately generic.
     */
    requestId: string;
    details?: ApiErrorDetail[];
  };
}

/** Narrowing helper for the web client and for tests. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  const { code, message, requestId } = error as Record<string, unknown>;
  return (
    typeof code === 'string' &&
    (ERROR_CODES as readonly string[]).includes(code) &&
    typeof message === 'string' &&
    typeof requestId === 'string'
  );
}
