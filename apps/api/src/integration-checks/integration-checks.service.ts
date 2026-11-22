import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  checkFeed,
  checkFlexi,
  checkShoptet,
  type CheckDeps,
  type FeedCheckInput,
  type FlexiCheckInput,
  type ShoptetCheckInput,
} from '@repo/core-sync';

export const CHECK_DEPS = Symbol('CHECK_DEPS');
/**
 * `fetch` reaches public addresses only (feeds, Shoptet); `flexiFetch` also
 * private ones when FLEXI_CHECK_ALLOW_PRIVATE is set, matching `allowPrivate`.
 */
export type IntegrationCheckDeps = CheckDeps & { shoptetBaseUrl: string; flexiFetch: typeof fetch };

/**
 * Pre-flight checks for the dashboard's "add integration" pages. Read-only:
 * credentials are used for one request and never stored or logged.
 */
@Injectable()
export class IntegrationChecksService {
  private readonly logger = new Logger(IntegrationChecksService.name);

  constructor(@Inject(CHECK_DEPS) private readonly deps: IntegrationCheckDeps) {}

  async flexi(input: FlexiCheckInput) {
    const r = await checkFlexi(input, { ...this.deps, fetch: this.deps.flexiFetch });
    this.logger.log(`flexi ${input.host}:${input.port}: ${r.steps.map((s) => `${s.key}=${s.code}`).join(' ')}`);
    return r;
  }

  async shoptet(input: ShoptetCheckInput) {
    const r = await checkShoptet(input, { ...this.deps, allowPrivate: false, baseUrl: this.deps.shoptetBaseUrl });
    this.logger.log(`shoptet: ${r.steps.map((s) => `${s.key}=${s.code}`).join(' ')}`);
    return r;
  }

  async feed(input: FeedCheckInput) {
    const r = await checkFeed(input, { ...this.deps, allowPrivate: false });
    this.logger.log(`feed ${new URL(input.url).host}: ${r.steps.map((s) => `${s.key}=${s.code}`).join(' ')}`);
    return r;
  }
}
