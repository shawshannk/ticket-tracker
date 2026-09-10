import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../../auth/audit.service';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { projectMembers } from '../../db/schema';
import { assertProjectKeepsAnAdmin } from './project-admins';

export class RemoveMemberCommand {
  constructor(
    readonly projectId: string,
    readonly userId: string,
    readonly actorId: string,
    readonly ip: string | null,
  ) {}
}

@CommandHandler(RemoveMemberCommand)
export class RemoveMemberHandler implements ICommandHandler<RemoveMemberCommand, void> {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async execute({ projectId, userId, actorId, ip }: RemoveMemberCommand): Promise<void> {
    const where = and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId));

    await this.db.transaction(async (tx) => {
      const [row] = await tx.select({ role: projectMembers.role }).from(projectMembers).where(where).limit(1);
      if (!row) {
        throw new NotFoundException('That user is not a member of this project');
      }
      if (row.role === 'admin') {
        await assertProjectKeepsAnAdmin(tx, projectId, userId);
      }
      await tx.delete(projectMembers).where(where);
    });

    // Removal ends the user's access to everything under the project on their very next request:
    // ProjectScopeGuard reads `project_members` per request, so nothing has to be revoked here.
    await this.audit.record({
      type: 'membership_changed',
      actorId,
      subjectId: userId,
      ip,
      metadata: { projectId, action: 'removed' },
    });
  }
}
