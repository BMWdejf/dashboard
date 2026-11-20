import { Module } from '@nestjs/common';

import { FlexiSyncController } from './flexi-sync.controller';
import { createFlexiSyncDeps } from './flexi-sync.deps';
import { FLEXI_SYNC, FlexiSyncService, syncRunsRepo, type FlexiSyncConfig } from './flexi-sync.service';
import { SyncTokenGuard } from './sync-token.guard';

@Module({
  controllers: [FlexiSyncController],
  providers: [
    FlexiSyncService,
    SyncTokenGuard,
    // A factory, not an instance: Flexi env is read only when a sync starts.
    {
      provide: FLEXI_SYNC,
      useValue: { deps: createFlexiSyncDeps, runs: syncRunsRepo } satisfies FlexiSyncConfig,
    },
  ],
})
export class FlexiSyncModule {}
