import { BadRequestException } from '@nestjs/common';
import { and, count, eq, ne } from 'drizzle-orm';
import type { DbExecutor } from '../../db';
import { projectMembers } from '../../db/schema';

/**
 * R18, project half: a project must always keep at least one project admin, or nobody can ever
 * manage its membership again except a platform admin. Mirrors `UpdateUserCommand`'s platform
 * half, including its choice of 400 over 409 — the request is well-formed but not permitted to
 * leave the system in that state, and the two refusals should read alike to a client.
 *
 * Runs inside the caller's transaction, so the count cannot go stale between check and write.
 */
export async function assertProjectKeepsAnAdmin(
  tx: DbExecutor,
  projectId: string,
  excludingUserId: string,
): Promise<void> {
  const [{ remaining }] = await tx
    .select({ remaining: count() })
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.role, 'admin'),
        ne(projectMembers.userId, excludingUserId),
      ),
    );

  if (remaining === 0) {
    throw new BadRequestException('The project must keep at least one project admin.');
  }
}
