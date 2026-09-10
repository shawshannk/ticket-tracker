import { BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { MemberAddDto } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import { AuditService } from '../../auth/audit.service';
import { isUniqueViolation } from '../../common/is-unique-violation';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { projectMembers, users } from '../../db/schema';

export class AddMemberCommand {
  constructor(
    readonly projectId: string,
    readonly input: MemberAddDto,
    readonly actorId: string,
    readonly ip: string | null,
  ) {}
}

@CommandHandler(AddMemberCommand)
export class AddMemberHandler implements ICommandHandler<AddMemberCommand, void> {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async execute({ projectId, input, actorId, ip }: AddMemberCommand): Promise<void> {
    // 400, not 404: on this route a 404 already means "no such project, as far as you are
    // concerned" (R12), and reusing it for a bad `userId` would make the two indistinguishable
    // to a client that has every right to tell them apart.
    const [target] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!target) {
      throw new BadRequestException(`No user with id ${input.userId}`);
    }

    try {
      await this.db
        .insert(projectMembers)
        .values({ projectId, userId: input.userId, role: input.role, createdBy: actorId });
    } catch (err) {
      // The (project_id, user_id) primary key. Changing an existing member's role is PATCH.
      if (isUniqueViolation(err)) {
        throw new ConflictException('That user is already a member of this project');
      }
      throw err;
    }

    await this.audit.record({
      type: 'membership_changed',
      actorId,
      subjectId: input.userId,
      ip,
      metadata: { projectId, action: 'added', role: input.role },
    });
  }
}
