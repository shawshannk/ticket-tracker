import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CreateProjectHandler } from './commands/create-project.command';
import { ProjectsController } from './projects.controller';
import { GetProjectHandler } from './queries/get-project.query';
import { GetProjectsHandler } from './queries/get-projects.query';
import { GetSprintsHandler } from './queries/get-sprints.query';
import { TicketKeyService } from './ticket-key.service';

@Module({
  imports: [CqrsModule],
  controllers: [ProjectsController],
  providers: [GetProjectsHandler, GetProjectHandler, GetSprintsHandler, CreateProjectHandler, TicketKeyService],
  // M5's ticket-create command allocates its key through this service.
  exports: [TicketKeyService],
})
export class ProjectsModule {}
