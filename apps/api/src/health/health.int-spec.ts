import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { isApiErrorBody } from '@ticket-tracker/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestIdMiddleware } from '../common/logging/request-id.middleware';

/**
 * M22's acceptance criteria, over real HTTP against a real Postgres.
 *
 * The error-contract cases are here rather than in a unit test because the thing being asserted
 * is what a *client* receives — after the filter, the serializer and Express have all had a turn.
 */
describe('health & the error contract (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Set **before** the dynamic import: `dev-impersonation.ts` reads the variable once at module
    // load, deliberately (a per-request read could be flipped by a mutated env). A static import
    // would therefore capture whatever the developer's own .env says, and a local .env with
    // impersonation on makes every route in this suite anonymous-accessible.
    process.env.AUTH_DEV_IMPERSONATION = 'false';
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('health', () => {
    it('serves liveness without touching a dependency', async () => {
      await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    });

    it('keeps /health as an alias so existing probes do not break', async () => {
      await request(app.getHttpServer()).get('/health').expect(200, { status: 'ok' });
    });

    it('reports readiness with the database up', async () => {
      const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.info.database.status).toBe('up');
    });

    it('needs no credentials — a probe has none', async () => {
      // All three are @Public(); a 401 here would mean the readiness probe fails permanently
      // in production for a reason nothing would explain.
      for (const path of ['/health', '/health/live', '/health/ready']) {
        const res = await request(app.getHttpServer()).get(path);
        expect(res.status).not.toBe(401);
      }
    });
  });

  describe('readiness with the database down', () => {
    let brokenApp: INestApplication;

    beforeAll(async () => {
      // Overriding the provider is how "Postgres is stopped" is simulated deterministically —
      // stopping the real container mid-suite would break every other integration test running
      // against it.
      const { AppModule } = await import('../app.module');
      const { DB } = await import('../db/db.module');
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DB)
        .useValue({ execute: () => Promise.reject(new Error('connection refused')) })
        .compile();
      brokenApp = moduleRef.createNestApplication();
      await brokenApp.init();
    });

    afterAll(async () => {
      await brokenApp?.close();
    });

    it('fails readiness with 503 while liveness still passes', async () => {
      const ready = await request(brokenApp.getHttpServer()).get('/health/ready').expect(503);
      expect(ready.body.status).toBe('error');
      expect(ready.body.error.database.status).toBe('down');

      // The distinction the split exists for: this process should stop receiving traffic, not
      // be restarted — a restart would not fix a database that is down.
      await request(brokenApp.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
    });
  });

  describe('the error envelope', () => {
    it('shapes a 401 from an unauthenticated route', async () => {
      const res = await request(app.getHttpServer()).get('/users').expect(401);
      expect(isApiErrorBody(res.body)).toBe(true);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });

    it('shapes a 404 for an unknown route', async () => {
      const res = await request(app.getHttpServer()).get('/no-such-route').expect(404);
      expect(isApiErrorBody(res.body)).toBe(true);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('shapes a 400 with per-field details from the Zod pipe', async () => {
      // A public route, deliberately: guards run before pipes, so on a guarded route the 401
      // would arrive first and this would assert nothing about validation.
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(isApiErrorBody(res.body)).toBe(true);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      // The issue list survives as structure all the way to the client, rather than being
      // flattened into a message string by the pipe as it was before M22.
      expect(res.body.error.details.length).toBeGreaterThan(0);
      expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain('password');
    });

    it('leaks no stack frame or SQL in any error body', async () => {
      for (const path of ['/users', '/no-such-route', '/projects/not-a-uuid']) {
        const res = await request(app.getHttpServer()).get(path);
        const serialised = JSON.stringify(res.body);
        expect(serialised).not.toMatch(/\bat [A-Za-z<]/); // stack frame
        expect(serialised).not.toMatch(/\bselect\b|\binsert\b|\bfrom "/i); // SQL
      }
    });

    it('echoes a caller-supplied request id', async () => {
      const res = await request(app.getHttpServer())
        .get('/no-such-route')
        .set('x-request-id', 'trace-abc-123');
      expect(res.headers['x-request-id']).toBe('trace-abc-123');
      expect(res.body.error.requestId).toBe('trace-abc-123');
      // Rejection of a malformed inbound id is asserted in request-id.middleware.spec.ts —
      // Node refuses to *send* a header containing a newline, so supertest cannot produce one.
    });
  });
});
