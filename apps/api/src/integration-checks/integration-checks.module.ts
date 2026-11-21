import { lookup } from 'node:dns/promises';

import { Module } from '@nestjs/common';

import { loadEnv, shoptetEnv } from '@repo/core-config';

import { SyncTokenGuard } from '../flexi-sync/sync-token.guard';
import { IntegrationChecksController } from './integration-checks.controller';
import { CHECK_DEPS, IntegrationChecksService, type IntegrationCheckDeps } from './integration-checks.service';

/** Only the API URL; the token comes from the form, not from env. */
const shoptetUrlEnv = shoptetEnv.pick({ SHOPTET_API_URL: true });

@Module({
  controllers: [IntegrationChecksController],
  providers: [
    IntegrationChecksService,
    SyncTokenGuard,
    {
      provide: CHECK_DEPS,
      useFactory: (): IntegrationCheckDeps => ({
        fetch: globalThis.fetch,
        lookup: async (host) => (await lookup(host, { all: true })).map((a) => a.address),
        shoptetBaseUrl: loadEnv(shoptetUrlEnv).SHOPTET_API_URL,
      }),
    },
  ],
})
export class IntegrationChecksModule {}
