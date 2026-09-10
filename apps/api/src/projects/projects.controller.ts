import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { projectCreateSchema, type Project, type ProjectCreateDto, type Sprint } from '@ticket-tracker/shared';
import type { AuthContext } from '../auth/auth-context';
import { Auth } from '../auth/current-user.decorator';
import { ProjectScope } from '../auth/project-scope.decorator';
import { RequirePlatform } from '../auth/require.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateProjectCommand } from './commands/create-project.command';
import { GetProjectQuery } from './queries/get-project.query';
import { GetProjectsQuery } from './queries/get-projects.query';
import { GetSprintsQuery } from './queries/get-sprints.query';

// Projects are the tenancy boundary (spec 02, R2) and now the visibility boundary too: reads
// are scoped to membership, and creation stays platform-Admin-only.
@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  /**
   * The one route a guard cannot protect: there is no single project to resolve, so the
   * membership filter has to live in the query itself (tech spec §6.3). This is the most likely
   * place for a leak to survive review — `GetProjectsHandler` is where to look.
   */
  @Get()
  @ApiOperation({ summary: "List the caller's projects" })
  list(@Auth() auth: AuthContext | null): Promise<Project[]> {
    return this.queryBus.execute(new GetProjectsQuery(auth));
  }

  @Get(':id')
  @ProjectScope('param', 'id')
  @ApiOperation({ summary: 'Get one project (404 for non-members)' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Project> {
    return this.queryBus.execute(new GetProjectQuery(id));
  }

  /** Read-only, for the board's Sprint filter (spec 04). Sprint management isn't spec'd. */
  @Get(':id/sprints')
  @ProjectScope('param', 'id')
  @ApiOperation({ summary: "List a project's sprints" })
  sprints(@Param('id', ParseUUIDPipe) id: string): Promise<Sprint[]> {
    return this.queryBus.execute(new GetSprintsQuery(id));
  }

  @Post()
  @RequirePlatform('project.create')
  @ApiOperation({ summary: 'Create a project (Admin only)' })
  @ApiBearerAuth()
  create(
    @Body(new ZodValidationPipe(projectCreateSchema)) body: ProjectCreateDto,
    @Auth() auth: AuthContext,
  ): Promise<Project> {
    return this.commandBus.execute(new CreateProjectCommand(body, auth.user.id));
  }
}
