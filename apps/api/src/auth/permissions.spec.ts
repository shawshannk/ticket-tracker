import {
  can,
  effectiveRole,
  PLATFORM_PERMISSIONS,
  PROJECT_PERMISSIONS,
  type PlatformAction,
  type ProjectAction,
  type UserRole,
} from '@ticket-tracker/shared';
import { describe, expect, it } from 'vitest';

const ROLES: UserRole[] = ['admin', 'manager', 'developer'];

/**
 * Both matrices, restated by hand from spec 10 §3.1–3.2 rather than derived from the source
 * maps. Inheriting the table from the code under test would make every edit self-approving;
 * written out, a wrong edit to `permissions.ts` fails a test instead of silently redefining
 * policy. This is the same argument M3's `roles.guard.spec.ts` made, carried over with it.
 */
const PLATFORM_EXPECTED: Record<PlatformAction, Record<UserRole, boolean>> = {
  'user.manage': { admin: true, manager: false, developer: false },
  'project.create': { admin: true, manager: false, developer: false },
  'directory.readEmails': { admin: true, manager: false, developer: false },
};

const PROJECT_EXPECTED: Record<ProjectAction, Record<UserRole, boolean>> = {
  'project.update': { admin: true, manager: true, developer: false },
  'project.members.manage': { admin: true, manager: true, developer: false },
  'ticket.read': { admin: true, manager: true, developer: true },
  'ticket.create': { admin: true, manager: true, developer: true },
  'ticket.createEpic': { admin: true, manager: true, developer: false },
  'ticket.update': { admin: true, manager: true, developer: true },
  'ticket.assign': { admin: true, manager: true, developer: false },
  'ticket.delete': { admin: true, manager: true, developer: false },
  'comment.create': { admin: true, manager: true, developer: true },
};

describe('the permission matrices', () => {
  it('declares exactly the platform actions the spec lists', () => {
    expect(Object.keys(PLATFORM_PERMISSIONS).sort()).toEqual(Object.keys(PLATFORM_EXPECTED).sort());
  });

  it('declares exactly the project actions the spec lists', () => {
    expect(Object.keys(PROJECT_PERMISSIONS).sort()).toEqual(Object.keys(PROJECT_EXPECTED).sort());
  });

  const cases = [
    ...(Object.entries(PLATFORM_EXPECTED) as [PlatformAction, Record<UserRole, boolean>][]),
    ...(Object.entries(PROJECT_EXPECTED) as [ProjectAction, Record<UserRole, boolean>][]),
  ];

  for (const [action, byRole] of cases) {
    for (const role of ROLES) {
      it(`can('${action}', '${role}') is ${byRole[role]}`, () => {
        expect(can(action, role)).toBe(byRole[role]);
      });
    }

    it(`can('${action}', null) is false`, () => {
      // A null role is "not signed in" or "not a member of this project". Neither may pass.
      expect(can(action, null)).toBe(false);
      expect(can(action, undefined)).toBe(false);
    });
  }
});

describe('effectiveRole()', () => {
  // The full truth table: 3 global roles × 4 membership states (each role, plus none).
  const MEMBERSHIPS: (UserRole | null)[] = ['admin', 'manager', 'developer', null];

  for (const membership of MEMBERSHIPS) {
    it(`a global admin is admin in a project where their membership is ${membership ?? 'absent'}`, () => {
      // Spec 10 §3.2: the platform admin is a superuser and needs no membership row.
      expect(effectiveRole('admin', membership)).toBe('admin');
    });
  }

  for (const global of ['manager', 'developer'] as const) {
    for (const membership of MEMBERSHIPS) {
      it(`a global ${global} with membership ${membership ?? 'absent'} is ${membership ?? 'null'}`, () => {
        // R13 in both directions: the membership wins, and it wins whether it is narrower or
        // wider than the global role. A global manager who is a project developer is a developer.
        expect(effectiveRole(global, membership)).toBe(membership);
      });
    }
  }

  it('treats undefined like a missing row', () => {
    expect(effectiveRole('developer', undefined)).toBeNull();
  });

  it('denies every project action to a non-member', () => {
    // The composed rule the guards rely on: no membership ⇒ no effective role ⇒ nothing allowed.
    // (The guard turns this into a 404 rather than a 403 — see project-scope.guard.ts.)
    const role = effectiveRole('manager', null);
    for (const action of Object.keys(PROJECT_PERMISSIONS) as ProjectAction[]) {
      expect(can(action, role)).toBe(false);
    }
  });
});
