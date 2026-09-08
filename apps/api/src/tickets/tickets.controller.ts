import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ticketCreateSchema, type Ticket, type TicketCreateDto, type User } from '@ticket-tracker/shared';
import { ACTING_USER_HEADER } from '../auth/acting-user.guard';
import { ActingUser } from '../auth/acting-user.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { Roles } from '../auth/roles.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CreateTicketCommand } from './commands/create-ticket.command';

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
}
