import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '../auth/auth.module';
import { AddMemberHandler } from './commands/add-member.command';
import { CreateProjectHandler } from './commands/create-project.command';
import { RemoveMemberHandler } from './commands/remove-member.command';
import { UpdateMemberHandler } from './commands/update-member.command';
import { MembersController } from './members.controller';
import { ProjectsController } from './projects.controller';
import { GetMembersHandler } from './queries/get-members.query';
import { GetProjectHandler } from './queries/get-project.query';
import { GetProjectsHandler } from './queries/get-projects.query';
import { GetSprintsHandler } from './queries/get-sprints.query';
import { TicketKeyService } from './ticket-key.service';

@Module({
  // AuthModule for AuditService: membership changes are audited authority (R19).
  imports: [CqrsModule, AuthModule],
  controllers: [ProjectsController, MembersController],
  providers: [
    GetProjectsHandler,
    GetProjectHandler,
    GetSprintsHandler,
    GetMembersHandler,
    CreateProjectHandler,
    AddMemberHandler,
    UpdateMemberHandler,
    RemoveMemberHandler,
    TicketKeyService,
  ],
  // M5's ticket-create command allocates its key through this service.
  exports: [TicketKeyService],
})
export class ProjectsModule {}
