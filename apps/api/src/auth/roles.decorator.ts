import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@ticket-tracker/shared';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to the given roles. Enforced by RolesGuard against the acting user.
 * Prefer passing a PERMISSIONS entry (`@Roles(...PERMISSIONS.manageUsers)`) over literals
 * so the matrix stays in one file.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
