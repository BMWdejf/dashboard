import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { FlexiApiError, type FlexiWriteResult } from '@repo/client-flexi';
import { EnvError } from '@repo/core-config';
import type { FeedItemRow } from '@repo/core-db';
import {
  buildCenikCreate,
  buildCenikFeedUpdate,
  FeedFlexiError,
  safeError,
  syncProductsByIds,
  type FeedFlexiCreateInput,
  type FeedFlexiProblem,
  type FeedFlexiUpdateInput,
} from '@repo/core-sync';

import type { FlexiSyncDeps } from '../flexi-sync/flexi-sync.deps';

export const FEED_FLEXI_DEPS = Symbol('FEED_FLEXI_DEPS');

export interface FeedFlexiWriter {
  upsert(evidence: string, records: Record<string, unknown>[]): Promise<FlexiWriteResult[]>;
  isDryRun: boolean;
}

export interface FeedFlexiDeps {
  /** Dry-run when `check` is true, otherwise as FLEXI_DRY_RUN says. Throws EnvError. */
  writer: (check: boolean) => FeedFlexiWriter;
  sync: () => FlexiSyncDeps;
  repo: {
    items(feedId: string, ids: string[]): Promise<FeedItemRow[]>;
    existingKods(kods: string[]): Promise<Set<string>>;
    link(pairs: { itemId: string; flexiId: number }[]): Promise<number>;
  };
}

export interface FeedFlexiItemResult {
  id: string;
  ok: boolean;
  problems: FeedFlexiProblem[];
  /** Flexi's own messages (Czech), safe to show. */
  messages: string[];
  flexiId?: number;
}

export interface FeedFlexiResult {
  /** Flexi only validated; nothing was saved. */
  dryRun: boolean;
  ok: number;
  failed: number;
  /** Products read back into the mirror after a real write. */
  synced: number;
  /** Written to Flexi, but reading them back into the mirror failed. */
  syncFailed: boolean;
  items: FeedFlexiItemResult[];
}

/** Records per PUT. Flexi saves a request whole or not at all. */
const CHUNK = 100;

/**
 * Supplier feed items → ABRA Flexi `cenik`: creates new products and updates
 * paired ones. Every write goes through FlexiClient, which adds ?dry-run=true
 * for a check and unless FLEXI_DRY_RUN=false. After a real write the products
 * are read back into the mirror and new ones are paired with their feed item.
 */
@Injectable()
export class FeedFlexiService {
  private readonly logger = new Logger(FeedFlexiService.name);

  constructor(@Inject(FEED_FLEXI_DEPS) private readonly deps: FeedFlexiDeps) {}

  async create(feedId: string, input: FeedFlexiCreateInput): Promise<FeedFlexiResult> {
    const writer = this.writer(input.check);
    const wanted = input.items.map((i) => ({ id: i.id, kod: i.kod.trim() }));
    const [items, existing] = await Promise.all([
      this.deps.repo.items(feedId, wanted.map((i) => i.id)),
      this.deps.repo.existingKods(wanted.map((i) => i.kod)),
    ]);
    const byId = new Map(items.map((i) => [i.id, i]));
    const kodCount = new Map<string, number>();
    for (const w of wanted) kodCount.set(w.kod, (kodCount.get(w.kod) ?? 0) + 1);

    const results = new Map<string, FeedFlexiItemResult>();
    const records: { itemId: string; record: Record<string, string> }[] = [];
    for (const w of wanted) {
      const fail = (p: FeedFlexiProblem) => results.set(w.id, { id: w.id, ok: false, problems: [p], messages: [] });
      const item = byId.get(w.id);
      if (!item) fail('notFound');
      else if (item.cenik) fail('alreadyLinked');
      else if ((kodCount.get(w.kod) ?? 0) > 1) fail('kodDuplicate');
      else if (existing.has(w.kod)) fail('kodExists');
      else {
        try {
          records.push({ itemId: w.id, record: buildCenikCreate(item, w.kod) });
        } catch (e) {
          if (e instanceof FeedFlexiError) fail(e.problem);
          else throw e;
        }
      }
    }

    for (const r of await this.write(writer, records)) results.set(r.id, r);
    const out = wanted.map((w) => results.get(w.id)!);
    if (writer.isDryRun) return this.summary(true, out, 0, false);

    const written = out.filter((r) => r.ok && r.flexiId !== undefined);
    const { synced, failed } = await this.readBack(written.map((r) => r.flexiId!));
    if (!failed) {
      await this.deps.repo
        .link(written.map((r) => ({ itemId: r.id, flexiId: r.flexiId! })))
        .catch((e: unknown) => this.logger.error(`pairing feed items failed: ${safeError(e)}`));
    }
    this.logger.log(`feed ${feedId}: ${written.length} products created in Flexi, ${synced} mirrored`);
    return this.summary(false, out, synced, failed);
  }

  async update(feedId: string, input: FeedFlexiUpdateInput): Promise<FeedFlexiResult> {
    const writer = this.writer(input.check);
    const items = new Map((await this.deps.repo.items(feedId, input.items)).map((i) => [i.id, i]));
    const results = new Map<string, FeedFlexiItemResult>();
    const records: { itemId: string; record: Record<string, string> }[] = [];
    for (const id of input.items) {
      const fail = (p: FeedFlexiProblem) => results.set(id, { id, ok: false, problems: [p], messages: [] });
      const item = items.get(id);
      if (!item) fail('notFound');
      else if (!item.cenik) fail('notLinked');
      else {
        try {
          records.push({ itemId: id, record: buildCenikFeedUpdate(item, item.cenik, input.fields) });
        } catch (e) {
          if (e instanceof FeedFlexiError) fail(e.problem);
          else throw e;
        }
      }
    }

    for (const r of await this.write(writer, records)) results.set(r.id, r);
    const out = input.items.map((id) => results.get(id)!);
    if (writer.isDryRun) return this.summary(true, out, 0, false);

    const flexiIds = out.filter((r) => r.ok).map((r) => items.get(r.id)!.cenik!.flexiId);
    const { synced, failed } = await this.readBack(flexiIds);
    this.logger.log(`feed ${feedId}: ${flexiIds.length} products updated in Flexi (${input.fields.join(', ')})`);
    return this.summary(false, out, synced, failed);
  }

  private writer(check: boolean): FeedFlexiWriter {
    try {
      return this.deps.writer(check);
    } catch (e) {
      if (e instanceof EnvError) throw new ServiceUnavailableException('ABRA Flexi is not configured in the API.');
      throw e;
    }
  }

  /**
   * Writes in chunks. Each record's result is found by the id it was sent
   * with: Flexi returns it as `request-id`, with errors for failed records.
   */
  private async write(
    writer: FeedFlexiWriter,
    records: { itemId: string; record: Record<string, string> }[],
  ): Promise<FeedFlexiItemResult[]> {
    const out: FeedFlexiItemResult[] = [];
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      try {
        const results = await writer.upsert(
          'cenik',
          chunk.map((c) => c.record),
        );
        const byRequest = new Map(results.map((r) => [r['request-id'], r]));
        for (const c of chunk) {
          const id = Number(byRequest.get(c.record.id)?.id);
          out.push({
            id: c.itemId,
            ok: true,
            problems: [],
            messages: [],
            ...(Number.isInteger(id) && id > 0 ? { flexiId: id } : {}),
          });
        }
      } catch (e) {
        if (e instanceof FlexiApiError && e.status >= 400 && e.status < 500) {
          const errors = new Map(e.results.map((r) => [r['request-id'], (r.errors ?? []).map((x) => x.message)]));
          const own = chunk.some((c) => errors.get(c.record.id)?.length);
          for (const c of chunk) {
            const messages = errors.get(c.record.id) ?? [];
            out.push(
              messages.length
                ? { id: c.itemId, ok: false, problems: [], messages }
                : own
                  ? { id: c.itemId, ok: false, problems: ['batchFailed'], messages: [] }
                  : { id: c.itemId, ok: false, problems: [], messages: e.messages },
            );
          }
        } else {
          this.logger.error(`flexi write failed: ${safeError(e)}`);
          for (const c of records.slice(i)) out.push({ id: c.itemId, ok: false, problems: ['flexiUnavailable'], messages: [] });
          break;
        }
      }
    }
    return out;
  }

  private async readBack(flexiIds: number[]): Promise<{ synced: number; failed: boolean }> {
    if (flexiIds.length === 0) return { synced: 0, failed: false };
    try {
      const { flexi, store } = this.deps.sync();
      return { synced: await syncProductsByIds({ flexi, store, flexiIds }), failed: false };
    } catch (e) {
      this.logger.error(`reading products back into the mirror failed: ${safeError(e)}`);
      return { synced: 0, failed: true };
    }
  }

  private summary(dryRun: boolean, items: FeedFlexiItemResult[], synced: number, syncFailed: boolean): FeedFlexiResult {
    const ok = items.filter((i) => i.ok).length;
    return { dryRun, ok, failed: items.length - ok, synced, syncFailed, items };
  }
}
