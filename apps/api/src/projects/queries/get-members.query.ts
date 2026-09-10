import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Department, ProjectMemberSummary } from '@ticket-tracker/shared';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { projectMembers, users } from '../../db/schema';

export class GetMembersQuery {
  constructor(readonly projectId: string) {}
}

/**
 * The project's member table (spec 10 §6). No membership check here — ProjectScopeGuard has
 * already answered 404 for anyone who shouldn't know the project exists.
 *
 * Emails are deliberately not selected: who may read an address is a platform-admin question
 * (tech spec §4.4), and a project manager listing their members is not that.
 */
@QueryHandler(GetMembersQuery)
export class GetMembersHandler implements IQueryHandler<GetMembersQuery, ProjectMemberSummary[]> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ projectId }: GetMembersQuery): Promise<ProjectMemberSummary[]> {
    const rows = await this.db
      .select({
        projectId: projectMembers.projectId,
        userId: projectMembers.userId,
        role: projectMembers.role,
        createdAt: projectMembers.createdAt,
        name: users.name,
        department: users.department,
        globalRole: users.role,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(users.name));

    // `department` is a text column, narrowed by Zod on the way in (as `user.mapper` does).
    return rows.map((r) => ({ ...r, department: r.department as Department, createdAt: r.createdAt.toISOString() }));
  }
}
