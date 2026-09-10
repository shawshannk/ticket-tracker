import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Ip, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  memberAddSchema,
  memberUpdateSchema,
  type MemberAddDto,
  type MemberUpdateDto,
  type ProjectMemberSummary,
} from '@ticket-tracker/shared';
import type { AuthContext } from '../auth/auth-context';
import { Auth } from '../auth/current-user.decorator';
import { ProjectScope } from '../auth/project-scope.decorator';
import { RequireProject } from '../auth/require.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AddMemberCommand } from './commands/add-member.command';
import { RemoveMemberCommand } from './commands/remove-member.command';
import { UpdateMemberCommand } from './commands/update-member.command';
import { GetMembersQuery } from './queries/get-members.query';

/**
 * Membership management (tech spec §4.2). Every route is `@ProjectScope('param')`, so a
 * non-member gets 404 before any of this runs; the writes additionally need
 * `project.members.manage`, which is a project role — a global manager who is only a developer
 * here cannot grant themselves more (R13).
 */
@ApiTags('projects')
@Controller('projects/:projectId/members')
@ProjectScope('param')
export class MembersController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  /** Any member may see who else is on the project. */
  @Get()
  @ApiOperation({ summary: "List a project's members" })
  list(@Param('projectId', ParseUUIDPipe) projectId: string): Promise<ProjectMemberSummary[]> {
    return this.queryBus.execute(new GetMembersQuery(projectId));
  }

  @Post()
  @RequireProject('project.members.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a member with a project role' })
  add(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(memberAddSchema)) body: MemberAddDto,
    @Auth() auth: AuthContext,
    @Ip() ip: string,
  ): Promise<void> {
    return this.commandBus.execute(new AddMemberCommand(projectId, body, auth.user.id, ip ?? null));
  }

  @Patch(':userId')
  @RequireProject('project.members.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Change a member's project role" })
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(memberUpdateSchema)) body: MemberUpdateDto,
    @Auth() auth: AuthContext,
    @Ip() ip: string,
  ): Promise<void> {
    return this.commandBus.execute(new UpdateMemberCommand(projectId, userId, body, auth.user.id, ip ?? null));
  }

  @Delete(':userId')
  @RequireProject('project.members.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a member' })
  remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Auth() auth: AuthContext,
    @Ip() ip: string,
  ): Promise<void> {
    return this.commandBus.execute(new RemoveMemberCommand(projectId, userId, auth.user.id, ip ?? null));
  }
}
