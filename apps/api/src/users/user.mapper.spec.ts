import type { users } from '../db/schema';
import { describe, expect, it } from 'vitest';
import { toUser } from './user.mapper';

type UserRow = typeof users.$inferSelect;

/**
 * A full row as Drizzle returns it — including the credential columns M15 added. The point of
 * building it this way is that `$inferSelect` makes the compiler fail here if a later module
 * adds another secret column without deciding what the mapper does with it.
 */
const row: UserRow = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Ada Admin',
  email: 'ada@nimbus.io',
  department: 'Engineering',
  role: 'admin',
  status: 'active',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaA',
  passwordChangedAt: new Date('2026-09-01T00:00:00Z'),
  lastLoginAt: new Date('2026-09-08T00:00:00Z'),
  createdAt: new Date('2026-07-15T00:00:00Z'),
};

describe('toUser', () => {
  // R17: password material must never leave the server. The mapper builds its output field by
  // field rather than spreading the row, which is what makes this hold — this test is here so
  // that a refactor to `{ ...row }` fails loudly instead of quietly publishing the hash.
  it('emits no password material', () => {
    const dto = toUser(row) as unknown as Record<string, unknown>;

    expect(dto).not.toHaveProperty('passwordHash');
    expect(dto).not.toHaveProperty('password_hash');
    expect(dto).not.toHaveProperty('passwordChangedAt');
    expect(JSON.stringify(dto)).not.toContain('argon2');
  });

  it('emits exactly the public User fields', () => {
    expect(Object.keys(toUser(row)).sort()).toEqual(
      ['createdAt', 'department', 'email', 'id', 'name', 'role'].sort(),
    );
  });

  it('converts createdAt to an ISO string', () => {
    expect(toUser(row).createdAt).toBe('2026-07-15T00:00:00.000Z');
  });
});
