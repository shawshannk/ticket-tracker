import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { userCreateSchema, userUpdateSchema, type User, type UserCreateDto, type UserUpdateDto } from '@ticket-tracker/shared';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { AuthContext } from '../auth/auth-context';
import { Auth } from '../auth/current-user.decorator';
import { RequirePlatform } from '../auth/require.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateUserCommand, type CreatedUser } from './commands/create-user.command';
import { UpdateUserCommand } from './commands/update-user.command';
import { GetUserQuery } from './queries/get-user.query';
import { GetUsersQuery } from './queries/get-users.query';

// Users are global, not project-scoped (spec 00), so these routes carry platform permissions
// and no @ProjectScope. Writes are Admin-only (spec 07), enforced by PermissionGuard rather
// than only hidden in the UI.
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all users' })
  list(): Promise<User[]> {
    return this.queryBus.execute(new GetUsersQuery());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one user' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<User> {
    return this.queryBus.execute(new GetUserQuery(id));
  }

  /**
   * Creates the account **and** its invite link, returned once (spec 10 §4.1). The account is
   * `invited` until that link is accepted, so it cannot log in before then.
   */
  @Post()
  @RequirePlatform('user.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a user and issue an invite link (Admin only)' })
  create(
    @Body(new ZodValidationPipe(userCreateSchema)) body: UserCreateDto,
    @Auth() auth: AuthContext,
  ): Promise<CreatedUser> {
    return this.commandBus.execute(new CreateUserCommand(body, auth.user.id));
  }

  @Patch(':id')
  @RequirePlatform('user.manage')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a user, including disabling them (Admin only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) body: UserUpdateDto,
    @Auth() auth: AuthContext,
  ): Promise<User> {
    return this.commandBus.execute(new UpdateUserCommand(id, body, auth.user.id));
  }
}
