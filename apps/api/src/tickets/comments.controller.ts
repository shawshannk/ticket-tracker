import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { commentUpdateSchema, type Comment, type CommentUpdateDto } from '@ticket-tracker/shared';
import type { AuthContext } from '../auth/auth-context';
import { Auth } from '../auth/current-user.decorator';
import { ProjectScope } from '../auth/project-scope.decorator';
import { RequireProject } from '../auth/require.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DeleteCommentCommand } from './commands/delete-comment.command';
import { UpdateCommentCommand } from './commands/update-comment.command';

/**
 * Comment editing (spec 10 §4.3, §3.3). Its own controller because these routes are addressed by
 * comment id, not under a ticket — the project has to be resolved through the row, which is what
 * `@ProjectScope('comment')` does.
 *
 * Both routes carry only `@RequireProject('ticket.read')` — the weakest project permission,
 * held by every role, standing for "you must be a member of this project". No stronger role
 * check belongs here: authorship, not role, decides both of these, and `ownership.ts` runs in
 * the handlers. The weak check still has to be present, though, or a request with no identity
 * at all (possible only while AUTH_DEV_IMPERSONATION is on) reaches a handler with a null
 * `auth` and crashes instead of being refused.
 */
@ApiTags('tickets')
@Controller('comments')
@ProjectScope('comment')
export class CommentsController {
  constructor(private readonly commandBus: CommandBus) {}

  /** The author only — a project admin is refused here, deliberately (spec 10 §3.3). */
  @Patch(':id')
  @RequireProject('ticket.read')
  @ApiOperation({ summary: 'Edit a comment (author only)' })
  @ApiBearerAuth()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(commentUpdateSchema)) body: CommentUpdateDto,
    @Auth() auth: AuthContext,
  ): Promise<Comment> {
    return this.commandBus.execute(new UpdateCommentCommand(id, body, auth));
  }

  @Delete(':id')
  @RequireProject('ticket.read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comment (author or project admin)' })
  @ApiBearerAuth()
  remove(@Param('id', ParseUUIDPipe) id: string, @Auth() auth: AuthContext): Promise<void> {
    return this.commandBus.execute(new DeleteCommentCommand(id, auth));
  }
}
