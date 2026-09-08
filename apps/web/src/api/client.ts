/**
 * The single place the frontend talks to the API.
 *
 * Types come from `@ticket-tracker/shared` rather than an OpenAPI codegen step (a recorded
 * deviation from SPEC.md — see PROGRESS.md M7). The API builds its responses from these exact
 * types, so they can't drift; a generated client would only restate them.
 *
 * Spec 08: the acting user travels as `X-Acting-User-Id` and is attached **here, once**, never
 * per call site. Reads don't need it; mutations do.
 */

export const ACTING_USER_HEADER = 'X-Acting-User-Id';

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
   * The acting user's id. Required by the API on every mutating call — the wrapper throws
   * rather than firing a request that would predictably 403.
   */
  actingUserId?: string | null;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, actingUserId } = options;
  const isMutation = method !== 'GET';

  if (isMutation && !actingUserId) {
    throw new ApiError(0, 'No acting user selected — pick one in the sidebar before making changes.');
  }

  const url = new URL(path.startsWith('/') ? path : `/${path}`, BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (isMutation && actingUserId) headers[ACTING_USER_HEADER] = actingUserId;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

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
