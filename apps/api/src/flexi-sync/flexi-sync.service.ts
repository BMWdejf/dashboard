import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { getFlexiSyncRun, getLastFlexiSync, getRunningFlexiSync } from '@repo/core-db';
import { runFlexiMirrorSync, safeError, type SyncTrigger } from '@repo/core-sync';

import type { FlexiSyncDeps } from './flexi-sync.deps';


/** Reads the run log (flexi_sync_run). A provider, so tests can replace it. */
export interface SyncRunsRepo {
  getRunning(): Promise<{ id: string } | null>;
  get(id: string): Promise<unknown>;
  getLast(): Promise<unknown>;
}

export const syncRunsRepo: SyncRunsRepo = {
  getRunning: () => getRunningFlexiSync(),
  get: (id) => getFlexiSyncRun(id),
  getLast: () => getLastFlexiSync(),
};

export const FLEXI_SYNC = Symbol('FLEXI_SYNC');

/** How the service gets a Flexi client + store, and the run log. */
export interface FlexiSyncConfig {
  /** Called when a sync starts (Flexi env is read only then). */
  deps: () => FlexiSyncDeps;
  runs: SyncRunsRepo;
}

/**
 * Starts Flexi → Neon syncs in the background and reports on them.
 *
 * There is no job queue yet, so a run executes inside this API process after
 * the request has returned 202. Only one run at a time (checked in-process and
 * in the run log). Replace with a queue + worker when one exists.
 */
@Injectable()
export class FlexiSyncService {
  private readonly logger = new Logger(FlexiSyncService.name);
  private current: Promise<unknown> | null = null;

  private readonly deps: () => FlexiSyncDeps;
  private readonly runs: SyncRunsRepo;

  constructor(@Inject(FLEXI_SYNC) config: FlexiSyncConfig) {
    this.deps = config.deps;
    this.runs = config.runs;
  }

  /** Starts a run and resolves with its id once it is recorded. */
  async start(trigger: SyncTrigger, full: boolean): Promise<{ runId: string }> {
    if (this.current || (await this.runs.getRunning())) {
      throw new ConflictException('A Flexi sync is already running.');
    }
    const { flexi, store } = this.deps();

    let resolveId!: (id: string) => void;
    const recorded = new Promise<string>((resolve) => (resolveId = resolve));
    const run = runFlexiMirrorSync({
      flexi,
      trigger,
      full,
      log: (msg) => this.logger.log(msg),
      store: {
        ...store,
        startRun: async (t) => {
          const id = await store.startRun(t);
          resolveId(id);
          return id;
        },
      },
    });
    this.current = run
      .then(({ runId, counts }) => this.logger.log(`run ${runId} done: ${JSON.stringify(counts.evidences)}`))
      .catch((e) => this.logger.error(`sync failed: ${safeError(e)}`))
      .finally(() => (this.current = null));

    // Fails fast if the run can't even be recorded (e.g. database down).
    const runId = await Promise.race([recorded, run.then((r) => r.runId)]);
    return { runId };
  }

  async getRun(id: string) {
    const run = await this.runs.get(id);
    if (!run) throw new NotFoundException('Sync run not found.');
    return run;
  }

  getLast() {
    return this.runs.getLast();
  }
}
