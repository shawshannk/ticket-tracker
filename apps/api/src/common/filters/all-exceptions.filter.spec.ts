import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { ApiErrorBody } from '@ticket-tracker/shared';
import { ERROR_CODES, isApiErrorBody } from '@ticket-tracker/shared';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AllExceptionsFilter } from './all-exceptions.filter';

function capture(exception: unknown): { status: number; body: ApiErrorBody } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ url: '/tickets/x', method: 'PATCH', requestId: 'req-abc' }),
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('AllExceptionsFilter', () => {
  it('maps a ZodError to 400 with the issue list intact', () => {
    const parsed = z.object({ title: z.string().min(1) }).safeParse({ title: '' });
    expect(parsed.success).toBe(false);

    const { status, body } = capture((parsed as { error: unknown }).error);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details).toEqual([{ path: 'title', message: expect.any(String) }]);
  });

  it('maps the Nest exceptions to their codes', () => {
    expect(capture(new ForbiddenException('nope')).body.error.code).toBe('FORBIDDEN');
    expect(capture(new NotFoundException('gone')).body.error.code).toBe('NOT_FOUND');
    expect(capture(new BadRequestException('bad')).body.error.code).toBe('VALIDATION_FAILED');
  });

  it('carries a pre-M22 `issues` payload through into `details`', () => {
    // Handlers written before this module threw BadRequestException({ message, issues }).
    // They keep working; the shape they produce is normalised here rather than at every call site.
    const { body } = capture(
      new BadRequestException({ message: 'Validation failed', issues: [{ path: 'a', message: 'Required' }] }),
    );
    expect(body.error.details).toEqual([{ path: 'a', message: 'Required' }]);
  });

  it('maps a unique violation nobody caught to 409, without the constraint name', () => {
    const driverError = Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), {
      code: '23505',
    });
    const wrapped = new Error('Failed query: insert into "users" ...');
    (wrapped as { cause?: unknown }).cause = driverError;

    const { status, body } = capture(wrapped);
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(JSON.stringify(body)).not.toContain('users_email_unique');
  });

  it('maps an oversize body to 413 rather than a 500', () => {
    // What body-parser actually throws: an http-errors object, not an HttpException.
    const err = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
      length: 2_000_033,
      limit: 1_048_576,
    });
    const { status, body } = capture(err);
    expect(status).toBe(413);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('maps a malformed JSON body to 400 without quoting the body back', () => {
    const err = Object.assign(new SyntaxError('Unexpected token } in JSON at position 42'), {
      status: 400,
      statusCode: 400,
      expose: true,
      body: '{"secret":"hunter2"}',
    });
    const { status, body } = capture(err);
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('keeps a non-exposable middleware error as a 500', () => {
    // `expose: false` is http-errors' own marker for "internal"; honouring the status anyway
    // would turn an internal fault into a message written for the caller.
    const err = Object.assign(new Error('upstream socket died'), { status: 400, expose: false });
    expect(capture(err).status).toBe(500);
  });

  it('never leaks internals from an unrecognised error', () => {
    const { status, body } = capture(
      new Error('select * from users where email = $1 -- boom\n    at Object.<anonymous>'),
    );
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('select');
    expect(serialised).not.toContain('at Object');
  });

  it('hides the payload of a 5xx HttpException too', () => {
    const { body } = capture(
      new HttpException({ message: 'connect ECONNREFUSED 10.0.0.5:5432' }, HttpStatus.INTERNAL_SERVER_ERROR),
    );
    expect(body.error.message).not.toContain('ECONNREFUSED');
  });

  it('stamps the request id on every error, including a 500', () => {
    for (const thrown of [new NotFoundException(), new Error('x')]) {
      const { body } = capture(thrown);
      expect(body.error.requestId).toBe('req-abc');
      expect(isApiErrorBody(body)).toBe(true);
      expect(ERROR_CODES).toContain(body.error.code);
    }
  });
});
