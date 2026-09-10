import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTokenStoreForTests, setAccessToken, setSessionExpiredHandler } from '../auth/tokenStore';
// Importing this registers the refresh handler on the token store, exactly as the app does.
import { resetRefreshForTests } from '../auth/refresh';
import { apiFetch, ApiError } from './client';

/**
 * M20's acceptance criteria at the wrapper, because that's the one place identity is attached —
 * if these hold, no call site can get it wrong. v1's equivalent tested `X-Acting-User-Id`; the
 * header is gone, and so is the idea that a caller supplies who it is.
 */
describe('apiFetch', () => {
  const fetchMock = vi.fn();
  const TOKEN = 'header.payload.signature';

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [URL, RequestInit];
    return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
  };

  const ok = (body: unknown = {}, status = 200) =>
    fetchMock.mockResolvedValueOnce({ ok: true, status, json: async () => body });

  const unauthorized = () =>
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: 'Unauthorized' }) });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    resetTokenStoreForTests();
    setAccessToken(null);
    setSessionExpiredHandler(() => {});
    resetRefreshForTests();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends no authorization header when signed out', async () => {
    ok([{ id: '1' }]);
    await apiFetch('/users');
    expect(lastCall().headers.authorization).toBeUndefined();
  });

  it.each(['GET', 'POST', 'PATCH', 'DELETE'] as const)('sends the bearer token on %s', async (method) => {
    // Reads are guarded in v2, so unlike v1 the token goes on every method, not just mutations.
    setAccessToken(TOKEN);
    ok({}, method === 'DELETE' ? 204 : 200);
    await apiFetch('/tickets/x', { method });
    expect(lastCall().headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('always includes credentials, so the refresh cookie reaches the API origin', async () => {
    ok();
    await apiFetch('/users');
    expect(lastCall().init.credentials).toBe('include');
  });

  it('drops empty query params so "All" filters leave the URL clean', async () => {
    ok({ items: [], total: 0 });
    await apiFetch('/projects/p/tickets', { query: { status: 'Done', priority: undefined, search: '', page: 2 } });
    const { url } = lastCall();
    expect(url.searchParams.get('status')).toBe('Done');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.has('priority')).toBe(false);
    expect(url.searchParams.has('search')).toBe(false);
  });

  it('returns undefined for a 204 instead of trying to parse a body', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    await expect(apiFetch('/tickets/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('surfaces the API error envelope: message, code, details and request id', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Validation failed',
          requestId: 'req-123',
          details: [{ path: 'title', message: 'Required' }],
        },
      }),
    });
    await expect(apiFetch('/projects/p/tickets', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400,
      message: 'Validation failed',
      code: 'VALIDATION_FAILED',
      requestId: 'req-123',
      details: [{ path: 'title', message: 'Required' }],
      // `.issues` is kept as an alias so pre-M22 call sites still read the field they expect.
      issues: [{ path: 'title', message: 'Required' }],
    });
  });

  it('falls back to a flat {message, issues} body for anything not speaking the envelope', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Validation failed', issues: [{ path: 'title', message: 'Required' }] }),
    });
    await expect(apiFetch('/projects/p/tickets', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 400,
      message: 'Validation failed',
      code: undefined,
      issues: [{ path: 'title', message: 'Required' }],
    });
  });

  it('still throws a usable error when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('not json'); } });
    await expect(apiFetch('/users')).rejects.toMatchObject({ status: 500 });
  });

  describe('401 handling', () => {
    it('refreshes once and retries the original request', async () => {
      unauthorized();
      ok({ accessToken: 'fresh', user: { id: 'u' }, memberships: [] }); // the refresh
      ok([{ id: '1' }]); // the retry

      await expect(apiFetch('/users')).resolves.toEqual([{ id: '1' }]);

      const paths = fetchMock.mock.calls.map(([url]) => (url as URL).pathname);
      expect(paths).toEqual(['/users', '/auth/refresh', '/users']);
      // The retry must carry the *new* token, or it 401s again and the user is signed out for
      // no reason.
      expect(lastCall().headers.authorization).toBe('Bearer fresh');
    });

    it('gives up after one failed refresh and reports the session expired', async () => {
      const onExpired = vi.fn();
      setSessionExpiredHandler(onExpired);

      unauthorized(); // the request
      unauthorized(); // the refresh

      await expect(apiFetch('/users')).rejects.toBeInstanceOf(ApiError);
      expect(onExpired).toHaveBeenCalledTimes(1);
      // Three calls would mean it retried anyway; two is one request plus one refusal.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('reports expiry once, however many requests fail afterwards', async () => {
      // The regression this exists for: the expiry handler clears the query cache, every mounted
      // query refetches, each refetch 401s and lands back here. Without a latch that is an
      // infinite loop, and it spins hot enough to crash the tab before the redirect to /login
      // completes — which is exactly how it showed up, as an intermittent e2e crash.
      const onExpired = vi.fn();
      setSessionExpiredHandler(onExpired);

      unauthorized(); // request 1
      unauthorized(); // its refresh — fails, session is now known dead
      for (let i = 0; i < 5; i++) unauthorized(); // five refetches in the aftermath

      await expect(apiFetch('/users')).rejects.toBeInstanceOf(ApiError);
      await Promise.all(
        Array.from({ length: 5 }, () => apiFetch('/users').catch(() => null)),
      );

      expect(onExpired).toHaveBeenCalledTimes(1);
      // And no further refresh attempts: 2 for the first request, then one each, never a retry.
      const refreshCalls = fetchMock.mock.calls.filter(([url]) => (url as URL).pathname === '/auth/refresh');
      expect(refreshCalls).toHaveLength(1);
    });

    it('does not try to refresh a failed login', async () => {
      // A 401 from /auth/login means "wrong password". Refreshing there would be nonsense, and
      // would replace the message the login page needs to show.
      unauthorized();
      await expect(apiFetch('/auth/login', { method: 'POST', body: {}, skipAuthRefresh: true })).rejects.toBeInstanceOf(ApiError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('fires exactly ONE refresh for ten simultaneous 401s', async () => {
      // The acceptance criterion, and the reason it exists: M16 consumes a refresh token on use,
      // so ten parallel refreshes would present an already-consumed token nine times, which
      // reuse detection reads as a stolen token and answers by killing the whole session (R16).
      for (let i = 0; i < 10; i++) unauthorized();
      let refreshes = 0;
      fetchMock.mockImplementation(async (url: URL) => {
        if (url.pathname === '/auth/refresh') {
          refreshes++;
          // Resolve on a later tick so all ten callers are genuinely waiting on the same promise.
          await new Promise((r) => setTimeout(r, 5));
          return { ok: true, status: 200, json: async () => ({ accessToken: 'fresh', user: {}, memberships: [] }) };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      });

      await Promise.all(Array.from({ length: 10 }, () => apiFetch('/users')));

      expect(refreshes).toBe(1);
    });
  });
});
