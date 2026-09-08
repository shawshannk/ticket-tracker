import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ProjectsModule } from '../projects/projects.module';
import { CreateTicketHandler } from './commands/create-ticket.command';
import { TicketsController } from './tickets.controller';

@Module({
  // ProjectsModule for TicketKeyService — key allocation belongs to the project that owns
  // the sequence, not to the tickets module.
  imports: [CqrsModule, ProjectsModule],
  controllers: [TicketsController],
  providers: [CreateTicketHandler],
})
export class TicketsModule {}
