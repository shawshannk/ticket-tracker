import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv } from './env';

const valid = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  AUTH_JWT_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults for everything optional', () => {
    const config = loadEnv(valid);
    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.REQUEST_TIMEOUT_MS).toBe(30_000);
    expect(config.webOrigins).toEqual(['http://localhost:5173']);
  });

  it('names the offending variable when one is missing', () => {
    // The whole point of §7: the failure is a sentence an operator can act on, not a stack
    // trace from the first request that needed the value.
    expect(() => loadEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(EnvValidationError);
    expect(() => loadEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/AUTH_JWT_SECRET/);
  });

  it('rejects a short signing secret', () => {
    expect(() => loadEnv({ ...valid, AUTH_JWT_SECRET: 'too-short' })).toThrow(
      /at least 32 characters/,
    );
  });

  it('rejects a non-postgres database url', () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /postgres:\/\//,
    );
  });

  it('reports every problem at once, not just the first', () => {
    try {
      loadEnv({ DATABASE_URL: 'nope', AUTH_JWT_SECRET: 'short', PORT: 'abc' });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).issues.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('splits and trims WEB_ORIGIN', () => {
    const config = loadEnv({ ...valid, WEB_ORIGIN: 'http://a.test, http://b.test' });
    expect(config.webOrigins).toEqual(['http://a.test', 'http://b.test']);
  });

  it('keeps api docs off in production unless explicitly enabled', () => {
    expect(loadEnv({ ...valid, NODE_ENV: 'production' }).apiDocsEnabled).toBe(false);
    expect(loadEnv({ ...valid, NODE_ENV: 'production', ENABLE_API_DOCS: 'true' }).apiDocsEnabled).toBe(true);
    expect(loadEnv({ ...valid, NODE_ENV: 'development' }).apiDocsEnabled).toBe(true);
  });
});
