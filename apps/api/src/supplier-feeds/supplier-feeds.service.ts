import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';

import {
  FeedReadError,
  importSupplierFeed,
  nextImportAt,
  previewSupplierFeed,
  safeError,
  validateFeedMapping,
  type CheckDeps,
  type FeedFailure,
  type FeedPreview,
  type FeedPreviewInput,
  type SupplierFeedImportStats,
  type SupplierFeedInput,
  type SupplierFeedStore,
} from '@repo/core-sync';

export const SUPPLIER_FEEDS = Symbol('SUPPLIER_FEEDS');

/** The database functions the service uses (@repo/core-db); replaced in tests. */
export interface SupplierFeedRepo {
  create(input: SupplierFeedInput, userId: string | null): Promise<string>;
  claim(id: string): Promise<{
    id: string;
    url: string;
    itemElement: string;
    mapping: SupplierFeedInput['mapping'];
    importIntervalMinutes: number | null;
  } | null>;
  finish(
    id: string,
    result:
      | { status: 'success'; stats: SupplierFeedImportStats; nextImportAt: Date | null }
      | { status: 'failed'; error: string; nextImportAt: Date | null },
  ): Promise<void>;
  listDue(): Promise<string[]>;
  exists(id: string): Promise<boolean>;
  store(): SupplierFeedStore;
  /** True when `create` failed because the URL is taken. */
  isDuplicate(e: unknown): boolean;
}

/** Network seams, the database, and whether this process runs the minute timer. */
export interface SupplierFeedsConfig {
  deps: CheckDeps;
  repo: SupplierFeedRepo;
  scheduler: boolean;
}

export type FeedPreviewResult = { ok: true; preview: FeedPreview } | { ok: false; failure: FeedFailure };

/** A failed automatic import is retried after this long. */
const RETRY_MINUTES = 30;
const TICK_MS = 60_000;

/**
 * Supplier XML feeds: the mapping preview, saving a feed, and imports (by
 * hand, right after saving, and every minute for the feeds that are due).
 *
 * There is no job queue yet, so imports run inside this API process after the
 * request has returned 202, one at a time. Imports only read the feed and
 * write `supplier_feed_item`; nothing goes to Flexi.
 */
@Injectable()
export class SupplierFeedsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupplierFeedsService.name);
  private queue: Promise<unknown> = Promise.resolve();
  private readonly queued = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  private readonly deps: CheckDeps;
  private readonly repo: SupplierFeedRepo;
  private readonly scheduler: boolean;

  constructor(@Inject(SUPPLIER_FEEDS) config: SupplierFeedsConfig) {
    this.deps = config.deps;
    this.repo = config.repo;
    this.scheduler = config.scheduler;
  }

  onModuleInit() {
    if (!this.scheduler) return;
    this.timer = setInterval(() => void this.runDue(), TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async preview(input: FeedPreviewInput): Promise<FeedPreviewResult> {
    try {
      const preview = await previewSupplierFeed(input, { ...this.deps, allowPrivate: false });
      this.logger.log(`preview ${new URL(input.url).host}: ${preview.items} items, ${preview.tags.length} tags`);
      return { ok: true, preview };
    } catch (e) {
      if (e instanceof FeedReadError) return { ok: false, failure: e.failure };
      throw e;
    }
  }

  /** Saves the feed and queues its first import. */
  async create(input: SupplierFeedInput, userId: string | null): Promise<{ id: string }> {
    const issues = validateFeedMapping(input.mapping);
    if (issues.length) {
      throw new UnprocessableEntityException({
        message: 'Invalid mapping.',
        errors: issues.map((i) => (i.code === 'unknownTag' ? `${i.code}: ${i.tag}` : `${i.code}: ${i.target}`)),
      });
    }
    let id: string;
    try {
      id = await this.repo.create(input, userId);
    } catch (e) {
      if (this.repo.isDuplicate(e)) throw new ConflictException('A feed with this URL is already connected.');
      throw e;
    }
    this.enqueue(id);
    return { id };
  }

  /** Queues an import by hand. */
  async start(id: string): Promise<{ queued: boolean }> {
    if (!(await this.repo.exists(id))) throw new NotFoundException('Feed not found.');
    return { queued: this.enqueue(id) };
  }

  /** Queues every feed whose automatic import is due. */
  async runDue(): Promise<{ queued: number }> {
    try {
      const ids = await this.repo.listDue();
      return { queued: ids.filter((id) => this.enqueue(id)).length };
    } catch (e) {
      this.logger.error(`listing due feeds failed: ${safeError(e)}`);
      return { queued: 0 };
    }
  }

  /** Resolves when every queued import has finished (tests, shutdown). */
  idle(): Promise<unknown> {
    return this.queue;
  }

  private enqueue(id: string): boolean {
    if (this.queued.has(id)) return false;
    this.queued.add(id);
    this.queue = this.queue.then(() => this.importOne(id)).finally(() => this.queued.delete(id));
    return true;
  }

  private async importOne(id: string) {
    const claim = await this.repo.claim(id).catch((e) => {
      this.logger.error(`claiming feed ${id} failed: ${safeError(e)}`);
      return null;
    });
    if (!claim) return;
    const now = this.deps.now ?? Date.now;
    try {
      const stats = await importSupplierFeed(claim, { ...this.deps, allowPrivate: false, store: this.repo.store() });
      await this.repo.finish(id, {
        status: 'success',
        stats,
        nextImportAt: nextImportAt(claim.importIntervalMinutes, new Date(now())),
      });
      this.logger.log(`feed ${id}: ${stats.written} items written, ${stats.removed} removed in ${stats.ms} ms`);
    } catch (e) {
      const failure: FeedFailure = e instanceof FeedReadError ? e.failure : { code: 'internal' };
      if (!(e instanceof FeedReadError)) this.logger.error(`feed ${id} import failed: ${safeError(e)}`);
      else this.logger.warn(`feed ${id} import failed: ${failure.code}`);
      await this.repo
        .finish(id, {
          status: 'failed',
          error: JSON.stringify(failure),
          nextImportAt: claim.importIntervalMinutes ? new Date(now() + RETRY_MINUTES * 60_000) : null,
        })
        .catch((err) => this.logger.error(`recording failure of feed ${id} failed: ${safeError(err)}`));
    }
  }
}
