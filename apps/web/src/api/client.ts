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
    /** Zod issue list from the API's validation pipe, when present. */
    readonly issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
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
    throw new ApiError(
      response.status,
      typeof payload?.message === 'string' ? payload.message : `Request failed (${response.status})`,
      payload?.issues,
    );
  }

  return payload as T;
}
