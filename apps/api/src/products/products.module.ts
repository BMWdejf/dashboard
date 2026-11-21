import { Module } from '@nestjs/common';

import { FlexiClient } from '@repo/client-flexi';
import { flexiEnv, loadEnv } from '@repo/core-config';

import { createFlexiSyncDeps } from '../flexi-sync/flexi-sync.deps';
import { SyncTokenGuard } from '../flexi-sync/sync-token.guard';
import { ProductsController } from './products.controller';
import { PRODUCT_DEPS, ProductsService, type ProductDeps } from './products.service';

/** Writer: dry-run follows FLEXI_DRY_RUN (default true = nothing is saved). */
function createWriter() {
  const env = loadEnv(flexiEnv);
  return new FlexiClient({
    url: env.FLEXI_URL,
    company: env.FLEXI_COMPANY,
    user: env.FLEXI_USER,
    password: env.FLEXI_PASSWORD,
    dryRun: env.FLEXI_DRY_RUN,
  });
}

@Module({
  controllers: [ProductsController],
  providers: [
    ProductsService,
    SyncTokenGuard,
    // Factories: Flexi env is read only when a request needs it.
    { provide: PRODUCT_DEPS, useValue: { writer: createWriter, sync: createFlexiSyncDeps } satisfies ProductDeps },
  ],
})
export class ProductsModule {}
