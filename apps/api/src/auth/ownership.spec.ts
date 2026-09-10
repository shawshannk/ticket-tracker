import { ForbiddenException } from '@nestjs/common';
import type { User, UserRole } from '@ticket-tracker/shared';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from './auth-context';
import {
  assertCanAssignTicket,
  assertCanDeleteComment,
  assertCanDeleteTicket,
  assertCanEditComment,
} from './ownership';

/**
 * R14's decision table, exhaustively. Hand-built `AuthContext`s in the style the old
 * `roles.guard.spec.ts` used: no database, no Nest, just the rule.
 *
 * Every case names the *role* and the *relationship* separately, because the whole point of
 * these functions is that the two are independent — a developer can do things a manager's role
 * alone would not permit, and a manager can do them without any relationship at all.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const SOMEONE_ELSE = '22222222-2222-4222-8222-222222222222';

const auth = (projectRole: UserRole | undefined, userId = ME): AuthContext => ({
  user: { id: userId, name: 'Test', email: 't@nimbus.io', department: 'Engineering', role: 'developer', status: 'active', createdAt: '' } as User,
  sessionId: null,
  impersonated: false,
  projectRole,
});

const ROLES: UserRole[] = ['admin', 'manager', 'developer'];

describe('assertCanDeleteTicket', () => {
  it.each(['admin', 'manager'] as const)('lets a project %s delete a ticket they did not report', (role) => {
    expect(() => assertCanDeleteTicket(auth(role), { reporterId: SOMEONE_ELSE })).not.toThrow();
  });

  it('lets a project developer delete a ticket they reported', () => {
    expect(() => assertCanDeleteTicket(auth('developer'), { reporterId: ME })).not.toThrow();
  });

  it('refuses a project developer a ticket someone else reported', () => {
    expect(() => assertCanDeleteTicket(auth('developer'), { reporterId: SOMEONE_ELSE })).toThrow(ForbiddenException);
  });

  it('refuses a developer a ticket with no reporter recorded', () => {
    // A pre-M15 row whose name-matching backfill found nobody. Null must never be treated as
    // "unowned, therefore anyone" — it falls back to the role check, which a developer fails.
    expect(() => assertCanDeleteTicket(auth('developer'), { reporterId: null })).toThrow(ForbiddenException);
  });

  it('still lets a manager delete a ticket with no reporter recorded', () => {
    expect(() => assertCanDeleteTicket(auth('manager'), { reporterId: null })).not.toThrow();
  });

  it('refuses when there is no project role at all', () => {
    // Belt and braces: ProjectScopeGuard 404s a non-member long before a handler runs, so this
    // is unreachable in the app. It is asserted anyway because "unreachable" is a claim about
    // today's routes, and this function must be safe on its own terms.
    expect(() => assertCanDeleteTicket(auth(undefined), { reporterId: SOMEONE_ELSE })).toThrow(ForbiddenException);
  });

  it('does not match a null reporter against a null-ish user id', () => {
    expect(() => assertCanDeleteTicket(auth('developer', ''), { reporterId: null })).toThrow(ForbiddenException);
  });
});

describe('assertCanAssignTicket', () => {
  const nobody = { reporterId: SOMEONE_ELSE, assigneeId: SOMEONE_ELSE };

  it.each(['admin', 'manager'] as const)('lets a project %s reassign any ticket', (role) => {
    expect(() => assertCanAssignTicket(auth(role), nobody)).not.toThrow();
  });

  it('lets a developer reassign a ticket they reported', () => {
    expect(() => assertCanAssignTicket(auth('developer'), { reporterId: ME, assigneeId: SOMEONE_ELSE })).not.toThrow();
  });

  it('lets a developer reassign a ticket currently assigned to them', () => {
    expect(() => assertCanAssignTicket(auth('developer'), { reporterId: SOMEONE_ELSE, assigneeId: ME })).not.toThrow();
  });

  it('refuses a developer who is neither reporter nor assignee', () => {
    expect(() => assertCanAssignTicket(auth('developer'), nobody)).toThrow(ForbiddenException);
  });

  it('refuses a developer on an unassigned ticket they did not report', () => {
    expect(() => assertCanAssignTicket(auth('developer'), { reporterId: SOMEONE_ELSE, assigneeId: null })).toThrow(
      ForbiddenException,
    );
  });

  it('refuses a developer on a ticket with neither reporter nor assignee recorded', () => {
    expect(() => assertCanAssignTicket(auth('developer'), { reporterId: null, assigneeId: null })).toThrow(
      ForbiddenException,
    );
  });
});

describe('assertCanEditComment', () => {
  it('lets the author edit their own comment', () => {
    expect(() => assertCanEditComment(auth('developer'), { authorId: ME })).not.toThrow();
  });

  it.each(ROLES)('refuses a project %s editing someone else\'s comment', (role) => {
    // Including admin, and that is the point: nobody may alter another person's words and leave
    // their name on it (spec 10 §3.3). If this test ever "fails", read the spec before the code.
    expect(() => assertCanEditComment(auth(role), { authorId: SOMEONE_ELSE })).toThrow(ForbiddenException);
  });
});

describe('assertCanDeleteComment', () => {
  it('lets the author delete their own comment', () => {
    expect(() => assertCanDeleteComment(auth('developer'), { authorId: ME })).not.toThrow();
  });

  it('lets a project admin delete it as moderation', () => {
    expect(() => assertCanDeleteComment(auth('admin'), { authorId: SOMEONE_ELSE })).not.toThrow();
  });

  it.each(['manager', 'developer'] as const)('refuses a project %s deleting someone else\'s', (role) => {
    // Managers are *not* moderators here — this is the one project rule that admits admins only.
    expect(() => assertCanDeleteComment(auth(role), { authorId: SOMEONE_ELSE })).toThrow(ForbiddenException);
  });

  it('refuses when there is no project role at all', () => {
    expect(() => assertCanDeleteComment(auth(undefined), { authorId: SOMEONE_ELSE })).toThrow(ForbiddenException);
  });
});
