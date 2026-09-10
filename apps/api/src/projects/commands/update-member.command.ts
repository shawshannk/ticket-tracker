import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { MemberUpdateDto } from '@ticket-tracker/shared';
import { and, eq } from 'drizzle-orm';
import { AuditService } from '../../auth/audit.service';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { projectMembers } from '../../db/schema';
import { assertProjectKeepsAnAdmin } from './project-admins';

export class UpdateMemberCommand {
  constructor(
    readonly projectId: string,
    readonly userId: string,
    readonly input: MemberUpdateDto,
    readonly actorId: string,
    readonly ip: string | null,
  ) {}
}

@CommandHandler(UpdateMemberCommand)
export class UpdateMemberHandler implements ICommandHandler<UpdateMemberCommand, void> {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async execute({ projectId, userId, input, actorId, ip }: UpdateMemberCommand): Promise<void> {
    const where = and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId));

    // Read, check and write in one transaction: between a role count and the update, a concurrent
    // demotion of the *other* admin would let both through and leave the project with none.
    const previousRole = await this.db.transaction(async (tx) => {
      const [row] = await tx.select({ role: projectMembers.role }).from(projectMembers).where(where).limit(1);
      if (!row) {
        throw new NotFoundException('That user is not a member of this project');
      }
      if (row.role === 'admin' && input.role !== 'admin') {
        await assertProjectKeepsAnAdmin(tx, projectId, userId);
      }
      await tx.update(projectMembers).set({ role: input.role }).where(where);
      return row.role;
    });

    await this.audit.record({
      type: 'membership_changed',
      actorId,
      subjectId: userId,
      ip,
      metadata: { projectId, action: 'role_changed', from: previousRole, to: input.role },
    });
  }
}
