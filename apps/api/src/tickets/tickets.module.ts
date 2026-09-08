import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ProjectsModule } from '../projects/projects.module';
import { AddCommentHandler } from './commands/add-comment.command';
import { CreateTicketHandler } from './commands/create-ticket.command';
import { DeleteTicketHandler } from './commands/delete-ticket.command';
import { MoveTicketStatusHandler } from './commands/move-ticket-status.command';
import { UpdateTicketHandler } from './commands/update-ticket.command';
import { GetTicketDetailHandler } from './queries/get-ticket-detail.query';
import { GetTicketsHandler } from './queries/get-tickets.query';
import { GetBoardHandler } from './queries/get-board.query';
import { GetOverviewStatsHandler } from './queries/get-overview-stats.query';
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
    GetTicketsHandler,
    GetTicketDetailHandler,
    GetBoardHandler,
    GetOverviewStatsHandler,
  ],
})
export class TicketsModule {}
