import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  commentCreateSchema,
  moveTicketStatusSchema,
  ticketCreateSchema,
  ticketUpdateSchema,
  type Comment,
  type CommentCreateDto,
  type MoveTicketStatusDto,
  type Ticket,
  type TicketCreateDto,
  type TicketUpdateDto,
  type User,
} from '@ticket-tracker/shared';
import { ACTING_USER_HEADER } from '../auth/acting-user.guard';
import { ActingUser } from '../auth/acting-user.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AddCommentCommand } from './commands/add-comment.command';
import { CreateTicketCommand } from './commands/create-ticket.command';
import { DeleteTicketCommand } from './commands/delete-ticket.command';
import { MoveTicketStatusCommand } from './commands/move-ticket-status.command';
import { UpdateTicketCommand } from './commands/update-ticket.command';

@ApiTags('tickets')
@Controller()
export class TicketsController {
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Tickets are created under a project, so the route carries the tenancy boundary (R2).
   * `@Roles(...writeTicket)` requires *a* recognized acting user — every role may create a
   * Story or Bug, and the narrower Epic gate is applied in the handler, where the body's
   * `type` is known.
   */
  @Post('projects/:projectId/tickets')
  @Roles(...PERMISSIONS.writeTicket)
  @ApiOperation({ summary: 'Create a ticket (Epic requires Admin or Manager)' })
  @ApiHeader({ name: ACTING_USER_HEADER, required: true })
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(ticketCreateSchema)) body: TicketCreateDto,
    @ActingUser() actingUser: User,
  ): Promise<Ticket> {
    return this.commandBus.execute(new CreateTicketCommand(projectId, body, actingUser));
  }

  /** Detail-view Save (spec 05). Any recognized role may edit any ticket. */
  @Patch('tickets/:id')
  @Roles(...PERMISSIONS.writeTicket)
  @ApiOperation({ summary: 'Update a ticket' })
  @ApiHeader({ name: ACTING_USER_HEADER, required: true })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ticketUpdateSchema)) body: TicketUpdateDto,
  ): Promise<Ticket> {
    return this.commandBus.execute(new UpdateTicketCommand(id, body));
  }

  /** Board drag-drop (spec 04) — a narrow endpoint so a card move needn't send the ticket. */
  @Patch('tickets/:id/status')
  @Roles(...PERMISSIONS.writeTicket)
  @ApiOperation({ summary: "Move a ticket's status" })
  @ApiHeader({ name: ACTING_USER_HEADER, required: true })
  moveStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moveTicketStatusSchema)) body: MoveTicketStatusDto,
  ): Promise<Ticket> {
    return this.commandBus.execute(new MoveTicketStatusCommand(id, body));
  }

  /** Unlike epic creation, this gate is unconditional, so it belongs on the route. */
  @Delete('tickets/:id')
  @Roles(...PERMISSIONS.deleteTicket)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a ticket (Admin or Manager only)' })
  @ApiHeader({ name: ACTING_USER_HEADER, required: true })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.commandBus.execute(new DeleteTicketCommand(id));
  }

  /** Author comes from the acting user, never the body (R6). */
  @Post('tickets/:id/comments')
  @Roles(...PERMISSIONS.writeTicket)
  @ApiOperation({ summary: 'Add a comment' })
  @ApiHeader({ name: ACTING_USER_HEADER, required: true })
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(commentCreateSchema)) body: CommentCreateDto,
    @ActingUser() actingUser: User,
  ): Promise<Comment> {
    return this.commandBus.execute(new AddCommentCommand(id, body, actingUser));
  }
}
