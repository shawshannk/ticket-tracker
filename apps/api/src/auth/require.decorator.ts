import { SetMetadata } from '@nestjs/common';
import type { PlatformAction, ProjectAction } from '@ticket-tracker/shared';

export const REQUIRE_PLATFORM_KEY = 'require:platform';
export const REQUIRE_PROJECT_KEY = 'require:project';

/**
 * Require a platform-scoped permission, decided by the caller's **global** role.
 * Replaces M3's `@Roles(...)`: naming the action rather than a role list keeps the matrix in
 * `packages/shared/src/permissions.ts` and off the route.
 */
export const RequirePlatform = (action: PlatformAction) => SetMetadata(REQUIRE_PLATFORM_KEY, action);

/**
 * Require a project-scoped permission, decided by the **effective** role for the project this
 * request touches (R13). The route must also carry `@ProjectScope(...)`, or there is no
 * effective role to check — PermissionGuard treats the omission as a server error, not a 403,
 * because a silently unguarded route is the failure mode worth being loud about.
 */
export const RequireProject = (action: ProjectAction) => SetMetadata(REQUIRE_PROJECT_KEY, action);
