import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ActingUserGuard } from './acting-user.guard';
import { AuditService } from './audit.service';
import { InviteService } from './invite.service';
import { PasswordService } from './password.service';
import { RolesGuard } from './roles.guard';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Both guards are global and order-sensitive: ActingUserGuard resolves the header first,
 * then RolesGuard reads the result. Nest runs APP_GUARD providers in registration order.
 *
 * M16 adds the credential services. They carry no HTTP surface yet — M17 builds the controller
 * and replaces ActingUserGuard with a real AuthGuard. Exported so the users module can issue an
 * invite when an admin creates an account.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: ActingUserGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    PasswordService,
    // Factory, not `TokenService` directly: its constructor takes plain strings (the secret and
    // TTL, defaulted from env), and Nest would try to resolve `String` as a provider and fail at
    // bootstrap. The explicit factory also keeps the class `new`-able in unit tests.
    { provide: TokenService, useFactory: () => new TokenService() },
    AuditService,
    SessionService,
    InviteService,
  ],
  exports: [PasswordService, TokenService, AuditService, SessionService, InviteService],
})
export class AuthModule {}
