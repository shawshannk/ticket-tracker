import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  boardQuerySchema,
  commentCreateSchema,
  moveTicketStatusSchema,
  ticketCreateSchema,
  ticketListQuerySchema,
  ticketUpdateSchema,
  type Comment,
  type CommentCreateDto,
  type BoardQuery,
  type MoveTicketStatusDto,
  type OverviewStats,
  type Paged,
  type Ticket,
  type TicketCreateDto,
  type TicketDetail,
  type TicketListQuery,
  type TicketSummary,
  type TicketUpdateDto,
} from '@ticket-tracker/shared';
import type { AuthContext } from '../auth/auth-context';
import { Auth } from '../auth/current-user.decorator';
import { ProjectScope } from '../auth/project-scope.decorator';
import { RequireProject } from '../auth/require.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AddCommentCommand } from './commands/add-comment.command';
import { CreateTicketCommand } from './commands/create-ticket.command';
import { DeleteTicketCommand } from './commands/delete-ticket.command';
import { MoveTicketStatusCommand } from './commands/move-ticket-status.command';
import { UpdateTicketCommand } from './commands/update-ticket.command';
import { GetTicketDetailQuery } from './queries/get-ticket-detail.query';
import { GetTicketsQuery } from './queries/get-tickets.query';
import { GetBoardQuery } from './queries/get-board.query';
import { GetOverviewStatsQuery } from './queries/get-overview-stats.query';

@ApiTags('tickets')
@Controller()
export class TicketsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  /**
   * Reads are project-scoped (R2) and now membership-scoped too (R12): every read route carries
   * `@ProjectScope`, so a non-member gets 404 rather than a page of somebody else's tickets.
   * No `@RequireProject('ticket.read')` on top — any effective role may read, and the guard's
   * 404 is the whole control.
   */
  @Get('projects/:projectId/tickets')
  @ProjectScope('param')
  @ApiOperation({ summary: 'List a project\'s tickets (filtered, sorted, paginated)' })
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(ticketListQuerySchema)) query: TicketListQuery,
  ): Promise<Paged<TicketSummary>> {
    return this.queryBus.execute(new GetTicketsQuery(projectId, query));
  }

  /** Flat list; the frontend groups into columns (spec 04). Not paginated by design. */
  @Get('projects/:projectId/board')
  @ProjectScope('param')
  @ApiOperation({ summary: "A project's board tickets, filtered by sprint and type" })
  board(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query(new ZodValidationPipe(boardQuerySchema)) query: BoardQuery,
  ): Promise<TicketSummary[]> {
    return this.queryBus.execute(new GetBoardQuery(projectId, query));
  }

  @Get('projects/:projectId/overview')
  @ProjectScope('param')
  @ApiOperation({ summary: 'Overview dashboard stats, computed in the database' })
  overview(@Param('projectId', ParseUUIDPipe) projectId: string): Promise<OverviewStats> {
    return this.queryBus.execute(new GetOverviewStatsQuery(projectId));
  }

  /** `@ProjectScope('ticket')` resolves the project from the row — R12 covers tickets addressed
   * directly by id, which is the scoping hole that is easiest to leave open. */
  @Get('tickets/:id')
  @ProjectScope('ticket')
  @ApiOperation({ summary: 'Get a ticket with comments, status options and story options' })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<TicketDetail> {
    return this.queryBus.execute(new GetTicketDetailQuery(id));
  }

  /**
   * Tickets are created under a project, so the route carries the tenancy boundary (R2).
   * `ticket.create` is open to every project role; the narrower Epic gate stays in the handler,
   * where the body's `type` is known, and now reads the effective project role (R13).
   */
  @Post('projects/:projectId/tickets')
  @ProjectScope('param')
  @RequireProject('ticket.create')
  @ApiOperation({ summary: 'Create a ticket (Epic requires project Admin or Manager)' })
  @ApiBearerAuth()
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(ticketCreateSchema)) body: TicketCreateDto,
    @Auth() auth: AuthContext,
  ): Promise<Ticket> {
    return this.commandBus.execute(new CreateTicketCommand(projectId, body, auth));
  }

  /** Detail-view Save (spec 05). Any project member may edit any ticket in it — a tracker where
   * a developer cannot fix a wrong label on someone else's bug is one people route around
   * (spec 10 §3.3). Reassignment is narrower and is M19's ownership check, not a route gate. */
  @Patch('tickets/:id')
  @ProjectScope('ticket')
  @RequireProject('ticket.update')
  @ApiOperation({ summary: 'Update a ticket' })
  @ApiBearerAuth()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ticketUpdateSchema)) body: TicketUpdateDto,
    @Auth() auth: AuthContext,
  ): Promise<Ticket> {
    return this.commandBus.execute(new UpdateTicketCommand(id, body, auth));
  }

  /** Board drag-drop (spec 04) — a narrow endpoint so a card move needn't send the ticket. */
  @Patch('tickets/:id/status')
  @ProjectScope('ticket')
  @RequireProject('ticket.update')
  @ApiOperation({ summary: "Move a ticket's status" })
  @ApiBearerAuth()
  moveStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moveTicketStatusSchema)) body: MoveTicketStatusDto,
  ): Promise<Ticket> {
    return this.commandBus.execute(new MoveTicketStatusCommand(id, body));
  }

  /**
   * Not `@RequireProject('ticket.delete')`: spec 10 §3.3 admits the ticket's *reporter* as well
   * as a project manager/admin, and that needs the row, so `assertCanDeleteTicket` in the
   * handler decides it.
   *
   * `ticket.read` — the weakest project permission, held by every role — stays on the route to
   * mean "you must be a member of this project". Without it, a request carrying no identity at
   * all (only reachable while AUTH_DEV_IMPERSONATION is on) would reach the handler with a null
   * `auth` and crash instead of being refused.
   */
  @Delete('tickets/:id')
  @ProjectScope('ticket')
  @RequireProject('ticket.read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a ticket (reporter, or project Manager/Admin)' })
  @ApiBearerAuth()
  remove(@Param('id', ParseUUIDPipe) id: string, @Auth() auth: AuthContext): Promise<void> {
    return this.commandBus.execute(new DeleteTicketCommand(id, auth));
  }

  /** Author comes from the authenticated user, never the body (R6). */
  @Post('tickets/:id/comments')
  @ProjectScope('ticket')
  @RequireProject('comment.create')
  @ApiOperation({ summary: 'Add a comment' })
  @ApiBearerAuth()
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(commentCreateSchema)) body: CommentCreateDto,
    @Auth() auth: AuthContext,
  ): Promise<Comment> {
    return this.commandBus.execute(new AddCommentCommand(id, body, auth));
  }
}
