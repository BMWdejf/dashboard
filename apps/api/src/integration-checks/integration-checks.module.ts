import { lookup as dnsLookup } from 'node:dns';
import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';

import { Module } from '@nestjs/common';
import { Agent, buildConnector, fetch as undiciFetch } from 'undici';

import { integrationChecksEnv, loadEnv, shoptetEnv } from '@repo/core-config';
import { addressAllowed, guardedLookup, ipLiteral } from '@repo/core-sync';

import { SyncTokenGuard } from '../flexi-sync/sync-token.guard';
import { IntegrationChecksController } from './integration-checks.controller';
import { CHECK_DEPS, IntegrationChecksService, type IntegrationCheckDeps } from './integration-checks.service';

/** Only the API URL; the token comes from the form, not from env. */
const shoptetUrlEnv = shoptetEnv.pick({ SHOPTET_API_URL: true });

/**
 * fetch whose connections go only to addresses the check allows:
 * - host names: the lookup runs at connect time, so DNS rebinding can't swap
 *   in an internal address after the "dns" step;
 * - IP literals (no lookup happens): checked by the connector itself;
 * - redirects are never followed automatically; callers follow them by hand
 *   and check each Location (checkFeed does).
 */
export function pinnedFetch(allowPrivate: boolean): typeof fetch {
  const connector = buildConnector({
    // Same contract as dns.lookup; only the option types are narrower.
    lookup: guardedLookup(allowPrivate, dnsLookup as Parameters<typeof guardedLookup>[1]) as unknown as LookupFunction,
  });
  const dispatcher = new Agent({
    connect: (opts, callback) => {
      const lit = ipLiteral(opts.hostname);
      if (lit && !addressAllowed(lit.address, allowPrivate)) {
        const e: NodeJS.ErrnoException = new Error(`Address not allowed: ${opts.hostname}`);
        e.code = 'EADDRBLOCKED';
        return callback(e, null);
      }
      return connector(opts, callback);
    },
  });
  return ((input: string | URL, init?: RequestInit) =>
    undiciFetch(input, { ...(init as object), redirect: 'manual', dispatcher })) as unknown as typeof fetch;
}

@Module({
  controllers: [IntegrationChecksController],
  providers: [
    IntegrationChecksService,
    SyncTokenGuard,
    {
      provide: CHECK_DEPS,
      useFactory: (): IntegrationCheckDeps => {
        const allowPrivate = loadEnv(integrationChecksEnv).FLEXI_CHECK_ALLOW_PRIVATE;
        return {
          fetch: pinnedFetch(false),
          flexiFetch: pinnedFetch(allowPrivate),
          allowPrivate,
          lookup: async (host) => (await lookup(host, { all: true })).map((a) => a.address),
          shoptetBaseUrl: loadEnv(shoptetUrlEnv).SHOPTET_API_URL,
        };
      },
    },
  ],
})
export class IntegrationChecksModule {}
