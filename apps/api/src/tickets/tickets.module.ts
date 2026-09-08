import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ProjectsModule } from '../projects/projects.module';
import { AddCommentHandler } from './commands/add-comment.command';
import { CreateTicketHandler } from './commands/create-ticket.command';
import { DeleteTicketHandler } from './commands/delete-ticket.command';
import { MoveTicketStatusHandler } from './commands/move-ticket-status.command';
import { UpdateTicketHandler } from './commands/update-ticket.command';
import { TicketsController } from './tickets.controller';

@Module({
  // ProjectsModule for TicketKeyService — key allocation belongs to the project that owns
  // the sequence, not to the tickets module.
  imports: [CqrsModule, ProjectsModule],
  controllers: [TicketsController],
  providers: [
    CreateTicketHandler,
    UpdateTicketHandler,
    MoveTicketStatusHandler,
    DeleteTicketHandler,
    AddCommentHandler,
  ],
})
export class TicketsModule {}
