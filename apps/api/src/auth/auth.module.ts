import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuditService } from './audit.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { InviteService } from './invite.service';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Guard order is load-bearing, and Nest runs APP_GUARD providers in registration order:
 * throttling first (a rate-limited caller should not reach a database lookup), then AuthGuard
 * resolving identity, then RolesGuard reading the result. M18 replaces RolesGuard with the
 * scope-aware pair.
 */
@Module({
  imports: [
    // A permissive global default; the real limit is the @Throttle on the auth routes.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
  ],
  controllers: [AuthController],
  providers: [
    { provide: APP_GUARD, useClass: LoginThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    PasswordService,
    // Factory, not `TokenService` directly: its constructor takes plain strings (the secret and
    // TTL, defaulted from env), and Nest would try to resolve `String` as a provider and fail at
    // bootstrap. The explicit factory also keeps the class `new`-able in unit tests.
    { provide: TokenService, useFactory: () => new TokenService() },
    AuditService,
    SessionService,
    InviteService,
    AuthService,
  ],
  exports: [PasswordService, TokenService, AuditService, SessionService, InviteService, AuthService],
})
export class AuthModule {}
