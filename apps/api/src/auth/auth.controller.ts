import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  inviteAcceptSchema,
  loginSchema,
  logoutSchema,
  passwordChangeSchema,
  type AuthResult,
  type InviteAcceptDto,
  type LoginDto,
  type PasswordChangeDto,
  type SessionSummary,
} from '@ticket-tracker/shared';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { AuthContext } from './auth-context';
import { AuthService } from './auth.service';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './cookies';
import { Auth } from './current-user.decorator';
import { Public } from './public.decorator';
import { SessionService, type SessionContext } from './session.service';

/** Recorded on each session so "where am I signed in" is meaningful. */
function contextOf(req: Request): SessionContext {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Rate limited per spec 10 §4.2: 10 attempts per 15 minutes. The limiter is keyed on IP in a
   * single process — a speed bump against credential stuffing, not a defence against a botnet
   * (docs/auth-tech-spec.md §6.6).
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const result = await this.auth.login(body.email, body.password, contextOf(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken, user: result.user, memberships: result.memberships };
  }

  /**
   * Public because it authenticates with the cookie, not a bearer token — by the time a client
   * calls this, its access token is expired by definition.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange the refresh cookie for a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResult> {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) {
      throw new UnauthorizedException('No refresh token');
    }

    try {
      const result = await this.auth.refresh(presented, contextOf(req));
      setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
      return { accessToken: result.accessToken, user: result.user, memberships: result.memberships };
    } catch (err) {
      // A refusal always clears the cookie: keeping a token the server has rejected only
      // guarantees the next attempt fails the same way, and after reuse detection it is dead.
      clearRefreshCookie(res);
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End this session, or every session' })
  async logout(
    @Body(new ZodValidationPipe(logoutSchema)) body: { allSessions?: boolean },
    @Auth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(auth.user.id, auth.sessionId, body.allSessions ?? false, contextOf(req));
    clearRefreshCookie(res);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The signed-in user and their project memberships' })
  async me(@Auth() auth: AuthContext) {
    return { user: auth.user, memberships: await this.auth.membershipsFor(auth.user.id) };
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change your own password; ends every other session' })
  async changePassword(
    @Body(new ZodValidationPipe(passwordChangeSchema)) body: PasswordChangeDto,
    @Auth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword(
      auth.user,
      auth.sessionId,
      body.currentPassword,
      body.newPassword,
      contextOf(req),
    );
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @Post('invite/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a password from an invite link and sign in' })
  async acceptInvite(
    @Body(new ZodValidationPipe(inviteAcceptSchema)) body: InviteAcceptDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResult> {
    const result = await this.auth.acceptInvite(body.token, body.password, contextOf(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken, user: result.user, memberships: result.memberships };
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Devices this account is signed in on' })
  sessionList(@Auth() auth: AuthContext): Promise<SessionSummary[]> {
    return this.sessions.listForUser(auth.user.id, auth.sessionId ?? undefined);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke one of your own sessions' })
  async revokeSession(@Param('id') id: string, @Auth() auth: AuthContext): Promise<void> {
    // Scoped to the caller's own sessions: without this check any id would be revocable,
    // which is a denial-of-service against every other account.
    const own = await this.sessions.listForUser(auth.user.id);
    if (!own.some((s) => s.id === id)) {
      throw new UnauthorizedException('Not your session');
    }
    await this.sessions.revokeFamily(id);
  }
}
