import { z } from 'zod';

/**
 * Every environment variable the API reads, validated **once at boot** (spec 11 §7).
 *
 * `assertImpersonationIsSafe()` already applies this discipline to one variable, for the reason
 * given in `dev-impersonation.ts`: a check that runs before anything listens cannot be missed.
 * This generalises it. A malformed `DATABASE_URL` or a 12-character `AUTH_JWT_SECRET` must stop
 * the process with a sentence naming the variable, not surface as a connection error under load
 * or a signature failure on someone's first login.
 */

const port = z.coerce.number().int().positive().max(65535);
const ms = z.coerce.number().int().positive();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: port.default(3000),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'DATABASE_URL must be a postgres:// connection string'),

  /**
   * Comma-separated. CORS matches on the *origin string*, and a wildcard is rejected by browsers
   * once credentials are enabled (main.ts), so this must name real origins.
   */
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  // --- Auth (spec 10). Consumed by TokenService/SessionService; validated here so a bad value
  // fails at boot rather than at the first login. ---
  AUTH_JWT_SECRET: z.string().min(32, 'AUTH_JWT_SECRET must be at least 32 characters'),
  AUTH_ACCESS_TTL: z.string().default('15m'),
  AUTH_REFRESH_TTL: z.string().default('30d'),
  AUTH_INVITE_TTL: z.string().default('7d'),
  AUTH_REFRESH_GRACE_MS: ms.default(10_000),
  AUTH_LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  AUTH_LOGIN_RATE_TTL_MS: ms.default(15 * 60 * 1000),
  AUTH_DEV_IMPERSONATION: z.enum(['true', 'false']).default('false'),
  AUTH_COOKIE_DOMAIN: z.string().optional(),

  // --- Observability & runtime (spec 11) ---
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REQUEST_TIMEOUT_MS: ms.default(30_000),
  SHUTDOWN_TIMEOUT_MS: ms.default(10_000),
  BODY_LIMIT: z.string().default('1mb'),
  /** Swagger is otherwise off in production — today it publishes the whole surface at `/api`. */
  ENABLE_API_DOCS: z.enum(['true', 'false']).default('false'),
  /** Unset means the Sentry integration is inert, so local and CI runs need no account. */
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
});

export type AppConfig = Readonly<z.infer<typeof envSchema>> & {
  readonly webOrigins: string[];
  readonly isProduction: boolean;
  readonly apiDocsEnabled: boolean;
};

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates and returns the typed config. Throws `EnvValidationError` listing **every** problem,
 * not just the first — an operator fixing a misconfigured deployment one boot at a time is the
 * experience this avoids.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }

  const env = result.data;
  const webOrigins = env.WEB_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return Object.freeze({
    ...env,
    webOrigins,
    isProduction: env.NODE_ENV === 'production',
    // Docs are on outside production, and in production only when explicitly asked for.
    apiDocsEnabled: env.NODE_ENV !== 'production' || env.ENABLE_API_DOCS === 'true',
  });
}

let cached: AppConfig | undefined;

/**
 * The validated config, computed once.
 *
 * `main.ts` calls `loadEnv()` explicitly first, inside a handler that can print an
 * `EnvValidationError` as a plain sentence — a throw during *module evaluation* escapes as a raw
 * stack trace no matter what bootstrap does, which is exactly the experience §7 exists to avoid.
 * Everything else (AppModule, tests) reaches the same object through here.
 */
export function getConfig(): AppConfig {
  cached ??= loadEnv();
  return cached;
}

/** Test-only: forget the memoized config so a suite can vary the environment. */
export function resetConfigForTests(): void {
  cached = undefined;
}
