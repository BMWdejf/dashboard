import { BadGatewayException, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

import { FlexiApiError } from '@repo/client-flexi';
import { buildCenikUpdate, safeError, syncOneProduct, type ProductChanges } from '@repo/core-sync';

import type { FlexiSyncDeps } from '../flexi-sync/flexi-sync.deps';

export const PRODUCT_DEPS = Symbol('PRODUCT_DEPS');

/** Flexi writer (dry-run per FLEXI_DRY_RUN) and reader + mirror store; created per call. */
export interface ProductDeps {
  writer: () => { upsert(evidence: string, records: Record<string, unknown>[]): Promise<unknown>; isDryRun: boolean };
  sync: () => FlexiSyncDeps;
}

export interface SaveResult {
  /** Flexi only validated the change and saved nothing (FLEXI_DRY_RUN is not "false"). */
  dryRun: boolean;
  /** The product was read back into the mirror. */
  synced: boolean;
}

/**
 * Product edits from the dashboard. Writes go to ABRA Flexi through FlexiClient,
 * which adds ?dry-run=true unless FLEXI_DRY_RUN=false: then Flexi validates and
 * saves nothing. After a real write the product is read back into the mirror.
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(@Inject(PRODUCT_DEPS) private readonly deps: ProductDeps) {}

  async save(flexiId: number, changes: ProductChanges): Promise<SaveResult> {
    const writer = this.deps.writer();
    try {
      await writer.upsert('cenik', [buildCenikUpdate(flexiId, changes)]);
    } catch (e) {
      throw this.toHttp(e);
    }
    this.logger.log(`cenik ${flexiId} ${writer.isDryRun ? 'validated (dry-run)' : 'written'}: ${Object.keys(changes).join(', ')}`);
    if (writer.isDryRun) return { dryRun: true, synced: false };
    await this.sync(flexiId);
    return { dryRun: false, synced: true };
  }

  async sync(flexiId: number): Promise<{ cards: number }> {
    const { flexi, store } = this.deps.sync();
    try {
      const r = await syncOneProduct({ flexi, store, flexiId });
      if (!r.found) throw new NotFoundException('Flexi has no product with this id.');
      return { cards: r.cards };
    } catch (e) {
      throw this.toHttp(e);
    }
  }

  /** Flexi validation errors → 422 with their messages; anything else → 502. */
  private toHttp(e: unknown) {
    if (e instanceof NotFoundException) return e;
    if (e instanceof FlexiApiError && e.status >= 400 && e.status < 500 && e.messages.length) {
      return new UnprocessableEntityException({ message: 'Flexi rejected the change.', errors: e.messages });
    }
    this.logger.error(`flexi call failed: ${safeError(e)}`);
    return new BadGatewayException('ABRA Flexi is not reachable or failed.');
  }
}
