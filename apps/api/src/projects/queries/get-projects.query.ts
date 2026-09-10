import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Project } from '@ticket-tracker/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { AuthContext } from '../../auth/auth-context';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { projectMembers, projects } from '../../db/schema';
import { toProject } from '../project.mapper';

export class GetProjectsQuery {
  /** Null only under AUTH_DEV_IMPERSONATION, where an anonymous caller keeps v1's open reads. */
  constructor(readonly auth: AuthContext | null) {}
}

/**
 * The membership filter for the project list (R12, tech spec §6.3).
 *
 * **This is a query-level filter, not a guard, and it has to be.** A guard resolves one project;
 * a list has none to resolve, so the only place the rule can live is the join below. If someone
 * later "simplifies" this back to `select().from(projects)`, every user sees every project name
 * and no test that checks a status code will notice.
 */
@QueryHandler(GetProjectsQuery)
export class GetProjectsHandler implements IQueryHandler<GetProjectsQuery, Project[]> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ auth }: GetProjectsQuery): Promise<Project[]> {
    // A platform admin is a superuser inside every project whether or not a membership row
    // exists (spec 10 §3.2), so filtering them by membership would hide projects they can open.
    if (!auth || auth.user.role === 'admin') {
      const rows = await this.db.select().from(projects).orderBy(asc(projects.name));
      return rows.map(toProject);
    }

    const rows = await this.db
      .select({ project: projects })
      .from(projects)
      .innerJoin(
        projectMembers,
        and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, auth.user.id)),
      )
      .orderBy(asc(projects.name));

    return rows.map((r) => toProject(r.project));
  }
}
