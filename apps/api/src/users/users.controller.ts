import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { userCreateSchema, userUpdateSchema, type User, type UserCreateDto, type UserUpdateDto } from '@ticket-tracker/shared';
import { ACTING_USER_HEADER } from '../auth/acting-user.guard';
import { PERMISSIONS } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateUserCommand } from './commands/create-user.command';
import { UpdateUserCommand } from './commands/update-user.command';
import { GetUserQuery } from './queries/get-user.query';
import { GetUsersQuery } from './queries/get-users.query';

// Users are global, not project-scoped (spec 00). Reads are open; writes are Admin-only
// (spec 07), enforced by RolesGuard rather than only hidden in the UI.
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

  @Post()
  @Roles(...PERMISSIONS.manageUsers)
  @ApiOperation({ summary: 'Create a user (Admin only)' })
  @ApiHeader({ name: ACTING_USER_HEADER, required: true })
  create(@Body(new ZodValidationPipe(userCreateSchema)) body: UserCreateDto): Promise<User> {
    return this.commandBus.execute(new CreateUserCommand(body));
  }

  @Patch(':id')
  @Roles(...PERMISSIONS.manageUsers)
  @ApiOperation({ summary: 'Update a user (Admin only)' })
  @ApiHeader({ name: ACTING_USER_HEADER, required: true })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) body: UserUpdateDto,
  ): Promise<User> {
    return this.commandBus.execute(new UpdateUserCommand(id, body));
  }
}
