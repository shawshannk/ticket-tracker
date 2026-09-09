import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { CreateUserHandler } from './commands/create-user.command';
import { UpdateUserHandler } from './commands/update-user.command';
import { GetUserHandler } from './queries/get-user.query';
import { GetUsersHandler } from './queries/get-users.query';
import { UsersController } from './users.controller';

@Module({
  // AuthModule for InviteService (issued when an admin creates a user), SessionService and
  // AuditService (revoking and recording when an account is disabled or re-roled).
  imports: [CqrsModule, AuthModule],
  controllers: [UsersController],
  providers: [GetUsersHandler, GetUserHandler, CreateUserHandler, UpdateUserHandler],
})
export class UsersModule {}
