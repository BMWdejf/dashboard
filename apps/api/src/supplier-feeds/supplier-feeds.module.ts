import { lookup } from 'node:dns/promises';

import { Module } from '@nestjs/common';

import { FlexiClient } from '@repo/client-flexi';
import { flexiEnv, loadEnv, supplierFeedEnv } from '@repo/core-config';
import {
  claimSupplierFeedImport,
  createSupplierFeed,
  createSupplierFeedStore,
  findExistingFlexiKods,
  finishSupplierFeedImport,
  getDb,
  getSupplierFeedItems,
  linkSupplierFeedItems,
  listDueSupplierFeedIds,
  SupplierFeedExistsError,
} from '@repo/core-db';

import { createFlexiSyncDeps } from '../flexi-sync/flexi-sync.deps';
import { SyncTokenGuard } from '../flexi-sync/sync-token.guard';
import { pinnedFetch } from '../integration-checks/integration-checks.module';
import { FEED_FLEXI_DEPS, FeedFlexiService, type FeedFlexiDeps } from './feed-flexi.service';
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

const feedFlexi: FeedFlexiDeps = {
  // Flexi env is read only when a request needs it. A check is always a dry run;
  // otherwise FLEXI_DRY_RUN decides (default true = nothing is saved).
  writer: (check) => {
    const env = loadEnv(flexiEnv);
    return new FlexiClient({
      url: env.FLEXI_URL,
      company: env.FLEXI_COMPANY,
      user: env.FLEXI_USER,
      password: env.FLEXI_PASSWORD,
      dryRun: check || env.FLEXI_DRY_RUN,
    });
  },
  sync: createFlexiSyncDeps,
  repo: {
    items: getSupplierFeedItems,
    existingKods: findExistingFlexiKods,
    link: linkSupplierFeedItems,
  },
};

@Module({
  controllers: [SupplierFeedsController],
  providers: [
    SupplierFeedsService,
    FeedFlexiService,
    SyncTokenGuard,
    { provide: FEED_FLEXI_DEPS, useValue: feedFlexi },
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
