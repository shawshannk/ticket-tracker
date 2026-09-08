import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { projectCreateSchema, type Project, type ProjectCreateDto } from '@ticket-tracker/shared';
import { ACTING_USER_HEADER } from '../auth/acting-user.guard';
import { PERMISSIONS } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateProjectCommand } from './commands/create-project.command';
import { GetProjectQuery } from './queries/get-project.query';
import { GetProjectsQuery } from './queries/get-projects.query';

// Projects are the tenancy boundary (spec 02, R2). Reads are open — the sidebar switcher
// needs the list — and creation is Admin-only.
@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  list(): Promise<Project[]> {
    return this.queryBus.execute(new GetProjectsQuery());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one project' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Project> {
    return this.queryBus.execute(new GetProjectQuery(id));
  }

  @Post()
  @Roles(...PERMISSIONS.manageProjects)
  @ApiOperation({ summary: 'Create a project (Admin only)' })
  @ApiHeader({ name: ACTING_USER_HEADER, required: true })
  create(@Body(new ZodValidationPipe(projectCreateSchema)) body: ProjectCreateDto): Promise<Project> {
    return this.commandBus.execute(new CreateProjectCommand(body));
  }
}
