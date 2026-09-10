import { CanActivate, ExecutionContext, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { effectiveRole, type UserRole } from '@ticket-tracker/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db';
import { DB } from '../db/db.module';
import { comments, projectMembers, projects, tickets } from '../db/schema';
import type { RequestWithAuth } from './auth-context';
import { PROJECT_SCOPE_KEY, type ProjectScopeMeta } from './project-scope.decorator';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves which project a request touches and what the caller may be inside it (R12, R13).
 *
 * **Everything it refuses is a 404.** A non-member must not be able to tell a project they can't
 * see from one that doesn't exist, so "no such project", "no such ticket" and "not a member" all
 * produce the same response — including for a ticket addressed by its own id, which is the case
 * that is easy to forget and impossible to notice when it's wrong (spec 10 §5, R12).
 *
 * Runs after AuthGuard and before PermissionGuard; see the ordering note in `auth.module.ts`.
 * Costs one query on `param` routes and two on `ticket`/`comment` routes.
 */
@Injectable()
export class ProjectScopeGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<ProjectScopeMeta | undefined>(PROJECT_SCOPE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!meta) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<RequestWithAuth>();

    // No identity at all. AuthGuard only allows this while AUTH_DEV_IMPERSONATION is on, where
    // v1 semantics apply: the request continues with no project role, so open reads stay open
    // and PermissionGuard answers 403 on anything guarded. With the flag off — the only
    // supported production configuration — AuthGuard has already thrown 401 and we never get here.
    if (!req.auth) {
      return true;
    }

    const param = req.params[meta.param];
    const raw = Array.isArray(param) ? param[0] : param;
    if (!raw) {
      throw new NotFoundException('Not found');
    }

    const projectId = meta.source === 'param' ? raw : await this.projectIdFor(meta.source, raw);
    if (!projectId) {
      throw new NotFoundException('Not found');
    }

    const role = await this.effectiveRoleFor(projectId, req.auth.user.id, req.auth.user.role);
    if (!role) {
      throw new NotFoundException('Not found');
    }

    req.auth.projectId = projectId;
    req.auth.projectRole = role;
    return true;
  }

  /** Resolve the owning project of a ticket or a comment. Null when the row does not exist. */
  private async projectIdFor(source: 'ticket' | 'comment', id: string): Promise<string | null> {
    // Route params are validated by ParseUUIDPipe *after* guards run, so a malformed id reaches
    // us here. Postgres would raise a type error on it; a 404 is both correct and quieter.
    if (!UUID_RE.test(id)) {
      return null;
    }

    if (source === 'ticket') {
      const [row] = await this.db
        .select({ projectId: tickets.projectId })
        .from(tickets)
        .where(eq(tickets.id, id))
        .limit(1);
      return row?.projectId ?? null;
    }

    const [row] = await this.db
      .select({ projectId: tickets.projectId })
      .from(comments)
      .innerJoin(tickets, eq(tickets.id, comments.ticketId))
      .where(eq(comments.id, id))
      .limit(1);
    return row?.projectId ?? null;
  }

  /**
   * One query answers both questions the 404 rule conflates: does the project exist, and is this
   * user a member? A global admin still has to clear the existence half — bypassing membership
   * is not the same as inventing a project.
   */
  private async effectiveRoleFor(projectId: string, userId: string, globalRole: UserRole) {
    if (!UUID_RE.test(projectId)) {
      return null;
    }

    const [row] = await this.db
      .select({ membershipRole: projectMembers.role })
      .from(projects)
      .leftJoin(
        projectMembers,
        and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)),
      )
      .where(eq(projects.id, projectId))
      .limit(1);

    return row ? effectiveRole(globalRole, row.membershipRole) : null;
  }
}
