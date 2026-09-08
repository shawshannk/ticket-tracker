import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CreateUserHandler } from './commands/create-user.command';
import { UpdateUserHandler } from './commands/update-user.command';
import { GetUserHandler } from './queries/get-user.query';
import { GetUsersHandler } from './queries/get-users.query';
import { UsersController } from './users.controller';

@Module({
  imports: [CqrsModule],
  controllers: [UsersController],
  providers: [GetUsersHandler, GetUserHandler, CreateUserHandler, UpdateUserHandler],
})
export class UsersModule {}
