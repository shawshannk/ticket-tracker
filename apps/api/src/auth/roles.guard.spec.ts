import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { User, UserRole } from '@ticket-tracker/shared';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, type GuardedAction } from './permissions';
import { RolesGuard } from './roles.guard';

function contextFor(required: readonly UserRole[] | undefined, role: UserRole | null): ExecutionContext {
  const actingUser: User | null =
    role === null
      ? null
      : {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'Test User',
          email: 'test@nimbus.io',
          department: 'Engineering',
          role,
          createdAt: new Date().toISOString(),
        };

  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ actingUser }) }),
  } as unknown as ExecutionContext;
}

/** Stands in for Nest's Reflector, returning whatever the case under test declares. */
function reflectorReturning(required: readonly UserRole[] | undefined): Reflector {
  return { getAllAndOverride: () => required } as unknown as Reflector;
}

function allows(required: readonly UserRole[] | undefined, role: UserRole | null): boolean {
  const guard = new RolesGuard(reflectorReturning(required));
  try {
    return guard.canActivate(contextFor(required, role));
  } catch (err) {
    expect(err).toBeInstanceOf(ForbiddenException);
    return false;
  }
}

const ROLES: UserRole[] = ['admin', 'manager', 'developer'];

// The matrix from specs/00-architecture-and-data-model.md, restated here independently of
// PERMISSIONS so a wrong edit to that map fails a test instead of silently redefining policy.
const EXPECTED: Record<GuardedAction, Record<UserRole, boolean>> = {
  manageUsers: { admin: true, manager: false, developer: false },
  manageProjects: { admin: true, manager: false, developer: false },
  createEpic: { admin: true, manager: true, developer: false },
  deleteTicket: { admin: true, manager: true, developer: false },
};

describe('RolesGuard decision table', () => {
  for (const [action, expectedByRole] of Object.entries(EXPECTED) as [GuardedAction, Record<UserRole, boolean>][]) {
    for (const role of ROLES) {
      const expected = expectedByRole[role];
      it(`${role} ${expected ? 'may' : 'may not'} ${action}`, () => {
        expect(allows(PERMISSIONS[action], role)).toBe(expected);
      });
    }

    it(`${action} is denied with no acting user`, () => {
      expect(allows(PERMISSIONS[action], null)).toBe(false);
    });
  }

  it('allows every role on a route with no @Roles metadata', () => {
    for (const role of ROLES) {
      expect(allows(undefined, role)).toBe(true);
    }
  });

  it('allows an anonymous request on a route with no @Roles metadata', () => {
    expect(allows(undefined, null)).toBe(true);
  });

  it('treats empty @Roles metadata as unguarded', () => {
    expect(allows([], 'developer')).toBe(true);
  });
});
