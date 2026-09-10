import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requestContext } from './request-context';

/** Rejects anything that isn't a plausible id, so a header cannot inject into a log line. */
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Establishes the request's correlation id (spec 11 §2) and opens the AsyncLocalStorage scope
 * that every later log line, error body and job payload reads from.
 *
 * An inbound `x-request-id` is honoured so a trace started at the ingress continues here, but it
 * is validated first: the value is echoed to clients and written to logs, and an unchecked header
 * is a log-injection vector.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header(REQUEST_ID_HEADER);
  const requestId = inbound && SAFE_ID.test(inbound) ? inbound : randomUUID();

  // Both places the id is read from later: `req` for the exception filter (which is handed the
  // request, not the async context, when Express unwinds an error), and the ALS for everything else.
  (req as Request & { requestId?: string }).requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  requestContext.run({ requestId, userId: null, projectId: null }, () => next());
}

/** Reads the id back off a request, for code holding the request but not the async context. */
export function getRequestId(req: unknown): string {
  const fromReq = (req as { requestId?: unknown } | undefined)?.requestId;
  return typeof fromReq === 'string' ? fromReq : requestContext.requestId();
}
