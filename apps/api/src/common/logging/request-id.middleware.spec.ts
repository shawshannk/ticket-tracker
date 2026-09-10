import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { getRequestId, requestIdMiddleware } from './request-id.middleware';
import { requestContext } from './request-context';

function run(inbound?: string) {
  const req = { header: () => inbound } as unknown as Request;
  const res = { setHeader: vi.fn() } as unknown as Response;
  let insideRequestId: string | undefined;
  const next = (() => {
    insideRequestId = requestContext.requestId();
  }) as NextFunction;

  requestIdMiddleware(req, res, next);
  return { req, res, insideRequestId };
}

describe('requestIdMiddleware', () => {
  it('generates an id when the caller sends none', () => {
    const { req, res, insideRequestId } = run();
    const id = getRequestId(req);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(insideRequestId).toBe(id);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', id);
  });

  it('continues a trace started upstream', () => {
    const { req } = run('trace-abc-123');
    expect(getRequestId(req)).toBe('trace-abc-123');
  });

  it.each([
    ['a newline', 'bad\nid'],
    ['a carriage return', 'bad\rid'],
    ['spaces', 'not an id'],
    ['an over-long value', 'x'.repeat(129)],
    ['an empty string', ''],
  ])('replaces %s rather than echoing it', (_label, malicious) => {
    // The value is echoed to the client and written to every log line for the request, so an
    // unchecked header is a log-injection vector — hence a whitelist, not an escape.
    const { req } = run(malicious);
    expect(getRequestId(req)).not.toBe(malicious);
    expect(getRequestId(req)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('reports "-" outside any request, so a boot or job log still formats', () => {
    expect(requestContext.requestId()).toBe('-');
  });

  it('lets a guard enrich the context in place', () => {
    const req = { header: () => undefined } as unknown as Request;
    const res = { setHeader: vi.fn() } as unknown as Response;
    let seen: unknown;
    requestIdMiddleware(req, res, (() => {
      requestContext.set({ userId: 'user-1', projectId: 'project-1' });
      seen = requestContext.get();
    }) as NextFunction);
    expect(seen).toMatchObject({ userId: 'user-1', projectId: 'project-1' });
  });
});
