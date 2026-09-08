import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ActingUserGuard } from './acting-user.guard';
import { RolesGuard } from './roles.guard';

/**
 * Both guards are global and order-sensitive: ActingUserGuard resolves the header first,
 * then RolesGuard reads the result. Nest runs APP_GUARD providers in registration order.
 */
@Module({
  providers: [
    { provide: APP_GUARD, useClass: ActingUserGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
