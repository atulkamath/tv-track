import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator';

@Controller('health')
export class HealthController {
  /** Unauthenticated liveness check — the only route not behind Clerk. */
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
