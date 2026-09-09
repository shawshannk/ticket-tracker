import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { User, UserCreateDto } from '@ticket-tracker/shared';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { users } from '../../db/schema';
import { InviteService } from '../../auth/invite.service';
import { isUniqueViolation } from '../../common/is-unique-violation';
import { toUser } from '../user.mapper';

/** The created user, plus the one-time invite link the admin has to pass on themselves. */
export interface CreatedUser {
  user: User;
  /**
   * Returned **once** and never stored in plaintext (spec 10 §4.1). There is no mail transport,
   * so if the admin loses it the recovery is a re-issued invite, not a lookup.
   */
  inviteUrl: string;
  inviteExpiresAt: string;
}

export class CreateUserCommand {
  constructor(
    readonly input: UserCreateDto,
    readonly actorId: string,
  ) {}
}

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, CreatedUser> {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly invites: InviteService,
  ) {}

  async execute({ input, actorId }: CreateUserCommand): Promise<CreatedUser> {
    try {
      // One transaction: an account created without its invite would be unreachable — status
      // defaults to `invited`, so it can never log in and nothing would say why.
      return await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(users).values(input).returning();
        const invite = await this.invites.issue(row.id, actorId, tx);

        return {
          user: toUser(row),
          inviteUrl: inviteUrlFor(invite.token),
          inviteExpiresAt: invite.expiresAt.toISOString(),
        };
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A user with email ${input.email} already exists`);
      }
      throw err;
    }
  }
}

/** Points at the web app, not the API — the invitee opens a page, not an endpoint. */
export function inviteUrlFor(token: string): string {
  const base = process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/invite/${token}`;
}
