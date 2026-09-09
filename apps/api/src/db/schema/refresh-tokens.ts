import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * One row per issued refresh token. A session is a *family*: every rotation inserts a new row
 * sharing the original `familyId`, so revoking a session means revoking the family (R16).
 *
 * `tokenHash` is a plain sha256, not argon2 — deliberately. The token is already 32 bytes of
 * entropy so a KDF adds nothing, this lookup runs on every refresh, and a unique index needs a
 * deterministic hash, which a salted KDF is not.
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set when the token is rotated. Presenting a token that already has this is reuse. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ip: text('ip'),
  },
  (t) => ({
    byFamily: index('refresh_tokens_family_idx').on(t.familyId),
    byUser: index('refresh_tokens_user_idx').on(t.userId),
  }),
);
