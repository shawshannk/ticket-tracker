import { SetMetadata } from '@nestjs/common';

/**
 * Where the project id comes from on this route.
 *
 * - `param`   — a route parameter holds it directly (default `projectId`).
 * - `ticket`  — a route parameter holds a *ticket* id; the project is resolved from the row.
 * - `comment` — likewise via a comment id, through its ticket. Used from M19's comment routes.
 */
export type ProjectScopeSource = 'param' | 'ticket' | 'comment';

export interface ProjectScopeMeta {
  source: ProjectScopeSource;
  param: string;
}

export const PROJECT_SCOPE_KEY = 'project-scope';

const DEFAULT_PARAM: Record<ProjectScopeSource, string> = {
  param: 'projectId',
  ticket: 'id',
  comment: 'id',
};

/**
 * Mark a route as project-scoped so ProjectScopeGuard resolves an effective role for it (R12).
 *
 * Declared explicitly rather than inferred from param names: sniffing for a `projectId` param is
 * exactly how a route ends up silently unguarded when someone renames it (tech spec §5.1).
 */
export const ProjectScope = (source: ProjectScopeSource, param?: string) =>
  SetMetadata(PROJECT_SCOPE_KEY, { source, param: param ?? DEFAULT_PARAM[source] } satisfies ProjectScopeMeta);
