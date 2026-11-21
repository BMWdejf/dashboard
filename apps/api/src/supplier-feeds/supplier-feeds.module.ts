import { lookup } from 'node:dns/promises';

import { Module } from '@nestjs/common';

import { loadEnv, supplierFeedEnv } from '@repo/core-config';
import {
  claimSupplierFeedImport,
  createSupplierFeed,
  createSupplierFeedStore,
  finishSupplierFeedImport,
  getDb,
  listDueSupplierFeedIds,
  SupplierFeedExistsError,
} from '@repo/core-db';
import { SyncTokenGuard } from '../flexi-sync/sync-token.guard';
import { pinnedFetch } from '../integration-checks/integration-checks.module';
import { SupplierFeedsController } from './supplier-feeds.controller';
import { SUPPLIER_FEEDS, SupplierFeedsService, type SupplierFeedRepo, type SupplierFeedsConfig } from './supplier-feeds.service';

const repo: SupplierFeedRepo = {
  create: (input, userId) => createSupplierFeed(input, userId),
  claim: (id) => claimSupplierFeedImport(id),
  finish: (id, result) => finishSupplierFeedImport(id, result),
  listDue: () => listDueSupplierFeedIds(),
  exists: async (id) => !!(await getDb().supplierFeed.findUnique({ where: { id }, select: { id: true } })),
  store: () => createSupplierFeedStore(),
  isDuplicate: (e) => e instanceof SupplierFeedExistsError,
};

@Module({
  controllers: [SupplierFeedsController],
  providers: [
    SupplierFeedsService,
    SyncTokenGuard,
    {
      provide: SUPPLIER_FEEDS,
      useFactory: (): SupplierFeedsConfig => ({
        // Feeds are public: the same pinned fetch as the feed check, never the LAN.
        deps: {
          fetch: pinnedFetch(false),
          lookup: async (host) => (await lookup(host, { all: true })).map((a) => a.address),
        },
        repo,
        scheduler: loadEnv(supplierFeedEnv).SUPPLIER_FEED_SCHEDULER,
      }),
    },
  ],
})
export class SupplierFeedsModule {}
