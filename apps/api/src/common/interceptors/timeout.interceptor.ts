import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  ServiceUnavailableException,
} from '@nestjs/common';
import { type Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

/**
 * Bounds every request (spec 11 §5). A pathological query otherwise holds a connection from a
 * pool that is sized in the low tens — a handful of them is an outage, and nothing in the app
 * currently stops one.
 *
 * This unblocks the *client and the connection*; it does not cancel the query itself. Postgres
 * -side `statement_timeout` is the other half and belongs to M59, which owns pool configuration.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs: number) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // A streaming or long-poll route would need an opt-out here; none exists yet, and M61's SSE
    // endpoint must remember to ask for one.
    return next.handle().pipe(
      timeout(this.timeoutMs),
      catchError((err) =>
        throwError(() =>
          err instanceof TimeoutError
            ? // 503, not 408: 408 means the *client* was slow to send its request, and this is the
              // server exceeding its own budget. Maps to the TIMEOUT code either way.
              new ServiceUnavailableException('The request took too long.')
            : err,
        ),
      ),
    );
  }
}
