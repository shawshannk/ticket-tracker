import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthResult, Membership, User } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { DB } from '../db/db.module';
import { projectMembers, users } from '../db/schema';
import { toUser } from '../users/user.mapper';
import { AuditService } from './audit.service';
import { InviteService } from './invite.service';
import { PasswordService } from './password.service';
import { SessionService, type SessionContext } from './session.service';
import { TokenService } from './token.service';

/** What every failed login says, whatever the real reason (spec 10 §4.2). */
const LOGIN_FAILED = 'Email or password is incorrect.';

export interface LoginOutcome extends AuthResult {
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly invites: InviteService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Unknown email, wrong password, an invited account and a disabled one are **indistinguishable**
   * to the caller, and cost roughly the same time — an unknown email still verifies against a
   * dummy hash. Anything else turns the login form into an account-existence oracle.
   */
  async login(email: string, password: string, ctx: SessionContext = {}): Promise<LoginOutcome> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);

    const fail = async (reason: string, subjectId?: string) => {
      await this.audit.record({
        type: 'login_failed',
        subjectId: subjectId ?? null,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        // The attempted email and the internal reason — never the password (R17).
        metadata: { email, reason },
      });
      return new UnauthorizedException(LOGIN_FAILED);
    };

    if (!row) {
      await this.passwords.verifyDummy(password);
      throw await fail('unknown_email');
    }

    if (!row.passwordHash || row.status !== 'active') {
      await this.passwords.verifyDummy(password);
      throw await fail(row.status === 'disabled' ? 'disabled' : 'not_activated', row.id);
    }

    if (!(await this.passwords.verify(row.passwordHash, password))) {
      throw await fail('wrong_password', row.id);
    }

    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));
    await this.audit.record({ type: 'login', actorId: row.id, subjectId: row.id, ip: ctx.ip, userAgent: ctx.userAgent });

    return this.establishSession(toUser(row), ctx);
  }

  /** Issues a session and its first access token. Shared by login and invite acceptance. */
  private async establishSession(user: User, ctx: SessionContext): Promise<LoginOutcome> {
    const session = await this.sessions.issue(user.id, ctx);
    const memberships = await this.membershipsFor(user.id);

    return {
      accessToken: this.tokens.signAccessToken({ sub: user.id, sid: session.familyId, role: user.role }),
      user,
      memberships,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.expiresAt,
    };
  }

  /**
   * Exchange a refresh token for a new access token, rotating the refresh token (R16).
   * The user is re-read rather than trusted from the old token: an account disabled mid-session
   * must not be able to refresh its way back in.
   */
  async refresh(presentedToken: string, ctx: SessionContext = {}): Promise<LoginOutcome> {
    const rotated = await this.sessions.rotate(presentedToken, ctx);

    const [row] = await this.db.select().from(users).where(eq(users.id, rotated.userId)).limit(1);
    if (!row || row.status !== 'active') {
      await this.sessions.revokeFamily(rotated.familyId);
      throw new UnauthorizedException('Account is no longer active');
    }

    const user = toUser(row);
    return {
      accessToken: this.tokens.signAccessToken({ sub: user.id, sid: rotated.familyId, role: user.role }),
      user,
      memberships: await this.membershipsFor(user.id),
      refreshToken: rotated.refreshToken,
      refreshExpiresAt: rotated.expiresAt,
    };
  }

  async logout(userId: string, sessionId: string | null, allSessions: boolean, ctx: SessionContext = {}): Promise<void> {
    if (allSessions || !sessionId) {
      await this.sessions.revokeAllForUser(userId);
    } else {
      await this.sessions.revokeFamily(sessionId);
    }
    await this.audit.record({
      type: 'logout',
      actorId: userId,
      subjectId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { allSessions },
    });
  }

  /**
   * Changing a password ends every *other* session (R15) — the whole point of changing it is
   * usually that someone else may have had it.
   */
  async changePassword(
    user: User,
    sessionId: string | null,
    currentPassword: string,
    newPassword: string,
    ctx: SessionContext = {},
  ): Promise<void> {
    const [row] = await this.db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!row?.passwordHash || !(await this.passwords.verify(row.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    this.passwords.assertAcceptable(newPassword, { email: user.email, name: user.name });

    await this.db
      .update(users)
      .set({ passwordHash: await this.passwords.hash(newPassword), passwordChangedAt: new Date() })
      .where(eq(users.id, user.id));

    await this.sessions.revokeAllForUser(user.id, sessionId ?? undefined);
    await this.audit.record({
      type: 'password_changed',
      actorId: user.id,
      subjectId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  /**
   * Accept an invite: set the password, activate the account, and sign the person straight in —
   * spec 10 §4.1 step 4 says they land logged in, not at a login form.
   *
   * Any sessions predating this are revoked: accepting an invite is a credential change, and
   * when it is being used as a password reset (§4.4) the old sessions are exactly what must go.
   */
  async acceptInvite(token: string, password: string, ctx: SessionContext = {}): Promise<LoginOutcome> {
    const { userId } = await this.invites.accept(token);

    const [row] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!row || row.status === 'disabled') {
      throw new UnauthorizedException('This invite link is no longer valid. Ask an administrator to send you a new one.');
    }

    this.passwords.assertAcceptable(password, { email: row.email, name: row.name });

    const [updated] = await this.db
      .update(users)
      .set({
        passwordHash: await this.passwords.hash(password),
        passwordChangedAt: new Date(),
        status: 'active',
      })
      .where(eq(users.id, userId))
      .returning();

    await this.sessions.revokeAllForUser(userId);

    return this.establishSession(toUser(updated), ctx);
  }

  async membershipsFor(userId: string): Promise<Membership[]> {
    const rows = await this.db
      .select({ projectId: projectMembers.projectId, role: projectMembers.role })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    return rows;
  }
}
