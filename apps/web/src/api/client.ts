import { type ApiErrorDetail, type ErrorCode, isApiErrorBody } from '@ticket-tracker/shared';
import { getAccessToken, notifySessionExpired, runRefresh } from '../auth/tokenStore';

/**
 * The single place the frontend talks to the API.
 *
 * Types come from `@ticket-tracker/shared` rather than an OpenAPI codegen step (a recorded
 * deviation from SPEC.md — see PROGRESS.md M7). The API builds its responses from these exact
 * types, so they can't drift; a generated client would only restate them.
 *
 * Spec 10 §7: identity travels as `Authorization: Bearer`, attached **here, once**, never per
 * call site — and on reads as well as writes, since v2 guards every route. `X-Acting-User-Id`
 * and the `actingUserId` parameter it needed are gone (R11).
 */

/** Vite proxies /api-relative calls to the API in dev; see vite.config.ts. */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * The stable machine-readable code from the API's error envelope (spec 11 §3). Branch on
     * this, never on `message` — the message is prose and may be reworded at any time.
     */
    readonly code: ErrorCode | undefined,
    /** Field-level validation detail, when the API sent any. */
    readonly details?: ApiErrorDetail[],
    /**
     * Echoed from the `x-request-id` response header / envelope. Surfaced in error UI so a user
     * can quote it and an operator can find the exact log line.
     */
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Back-compat alias: pre-M22 call sites read `.issues`. */
  get issues(): ApiErrorDetail[] | undefined {
    return this.details;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  /** Search params; undefined/null/'' entries are dropped so "All" filters vanish from the URL. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /**
   * Skip the refresh-and-retry dance on a 401. Set on the auth routes themselves: `/auth/login`
   * answering 401 means "wrong password", not "expired token", and `/auth/refresh` retrying
   * itself would recurse.
   */
  skipAuthRefresh?: boolean;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const { method = 'GET', body, query } = options;

  const url = new URL(path.startsWith('/') ? path : `/${path}`, BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';

  const token = getAccessToken();
  if (token) headers.authorization = `Bearer ${token}`;

  return fetch(url, {
    method,
    headers,
    // The refresh token is an HttpOnly cookie on the API origin, and the API runs on a different
    // port in dev, so it only travels if credentials are included. Without this, every reload
    // would look like a fresh, unauthenticated visit.
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options);

  if (response.status === 401 && !options.skipAuthRefresh) {
    // `runRefresh` is a callback `refresh.ts` registered on the token store, not an import of
    // `refresh.ts` itself — that would be a cycle, and the dynamic import used to dodge it could
    // load a second copy of the module in dev, breaking the single-flight guarantee.
    const refreshed = await runRefresh();

    if (refreshed) {
      response = await send(path, options);
    } else {
      // One retry, no more. If the refresh failed the session is over, and hammering the API
      // with the same dead cookie only produces more 401s.
      notifySessionExpired();
    }
  }

  // 204 from DELETE /tickets/:id — no body to parse.
  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    // M22 gave every API error one shape. The pre-M22 flat `{ message, issues }` body is still
    // read as a fallback so a stale API build, or an error produced by something in front of the
    // API (a proxy, nginx), still yields a usable message rather than "Request failed".
    if (isApiErrorBody(payload)) {
      const { code, message, requestId, details } = payload.error;
      throw new ApiError(response.status, message, code, details, requestId);
    }

    const legacy = payload as { message?: unknown; issues?: ApiErrorDetail[] } | null;
    throw new ApiError(
      response.status,
      typeof legacy?.message === 'string' ? legacy.message : `Request failed (${response.status})`,
      undefined,
      legacy?.issues,
      response.headers?.get?.('x-request-id') ?? undefined,
    );
  }

  return payload as T;
}
