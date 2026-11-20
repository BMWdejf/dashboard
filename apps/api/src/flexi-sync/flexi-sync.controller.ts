import {
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { FlexiSyncService } from './flexi-sync.service';
import { SyncTokenGuard } from './sync-token.guard';

/**
 * Flexi → Neon mirror sync.
 * - POST /sync/flexi[?full=true]  start a run (202 + runId); 409 when one is running
 * - GET  /sync/flexi/cron          the same for a scheduler that can only GET (Vercel Cron)
 * - GET  /sync/flexi/runs/:id      one run with counts
 * - GET  /sync/flexi/last          the latest run
 * All need `Authorization: Bearer <SYNC_API_TOKEN>`.
 */
@Controller('sync/flexi')
@UseGuards(SyncTokenGuard)
export class FlexiSyncController {
  constructor(private readonly sync: FlexiSyncService) {}

  @Post()
  @HttpCode(202)
  start(@Query('full', new DefaultValuePipe(false), ParseBoolPipe) full: boolean) {
    return this.sync.start('api', full);
  }

  @Get('cron')
  @HttpCode(202)
  cron() {
    return this.sync.start('cron', false);
  }

  @Get('runs/:id')
  run(@Param('id', ParseUUIDPipe) id: string) {
    return this.sync.getRun(id);
  }

  @Get('last')
  last() {
    return this.sync.getLast();
  }
}
