import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTING_USER_HEADER, apiFetch, ApiError } from './client';

/**
 * The acceptance criterion for M7: every mutation carries `X-Acting-User-Id`, and no read
 * does. Tested at the wrapper because that's the one place it's attached — if this holds,
 * no call site can get it wrong.
 */
describe('apiFetch', () => {
  const fetchMock = vi.fn();
  const ACTOR = '00000000-0000-4000-8000-000000000001';

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [URL, RequestInit];
    return { url, init, headers: (init.headers ?? {}) as Record<string, string> };
  };

  const ok = (body: unknown = {}, status = 200) =>
    fetchMock.mockResolvedValueOnce({ ok: true, status, json: async () => body });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends no acting-user header on a read', async () => {
    ok([{ id: '1' }]);
    await apiFetch('/users');
    expect(lastCall().headers[ACTING_USER_HEADER]).toBeUndefined();
    expect(lastCall().init.method).toBe('GET');
  });

  it.each(['POST', 'PATCH', 'DELETE'] as const)('sends the acting-user header on %s', async (method) => {
    ok({}, method === 'DELETE' ? 204 : 200);
    await apiFetch('/tickets/x', { method, actingUserId: ACTOR });
    expect(lastCall().headers[ACTING_USER_HEADER]).toBe(ACTOR);
  });

  it('refuses to fire a mutation with no acting user, rather than letting it 403', async () => {
    await expect(apiFetch('/tickets/x', { method: 'POST', actingUserId: null })).rejects.toThrow(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
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
    await expect(apiFetch('/tickets/x', { method: 'DELETE', actingUserId: ACTOR })).resolves.toBeUndefined();
  });

  it('surfaces the API error message and validation issues', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Validation failed', issues: [{ path: 'title', message: 'Required' }] }),
    });
    await expect(apiFetch('/projects/p/tickets', { method: 'POST', body: {}, actingUserId: ACTOR }))
      .rejects.toMatchObject({ status: 400, message: 'Validation failed', issues: [{ path: 'title', message: 'Required' }] });
  });

  it('still throws a usable error when the body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('not json'); } });
    await expect(apiFetch('/users')).rejects.toMatchObject({ status: 500 });
  });
});
