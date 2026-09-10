import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/public.decorator';
import { DatabaseHealthIndicator } from './db.health';

/**
 * Liveness and readiness (spec 11 §4). Both are `@Public()` — a probe carries no credentials,
 * which is why the health route was one of spec 10 §3.4's four unauthenticated routes.
 *
 * The split is the point. Liveness answers "should this process be restarted"; readiness answers
 * "should this process receive traffic". Conflating them means either a database blip restarts
 * every container, or a broken instance keeps serving errors.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  /** The pre-M22 route, kept so existing probes and tests do not break. Aliases liveness. */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness (legacy alias of /health/live)' })
  getHealth(): { status: string } {
    return { status: 'ok' };
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness — the process is up. No dependency checks.' })
  live(): { status: string } {
    // Deliberately dependency-free: if this handler runs at all, the event loop is turning.
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — every dependency answers. 503 when one does not.' })
  ready() {
    // M25 adds Redis here, M33 object storage. Each new dependency belongs in this list, so
    // "ready" keeps meaning "can actually serve a request".
    return this.health.check([() => this.database.pingCheck('database')]);
  }
}
