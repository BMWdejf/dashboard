/**
 * Pure maths for the /integrations page: health of the Flexi → Neon mirror
 * sync from its recorded runs (flexi_sync_run). No database access here.
 */

export interface SyncRunInput {
  status: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  counts: unknown;
  error: string | null;
}

export type RunStatus = 'success' | 'failed' | 'running';

export interface FlexiSyncHealth {
  /** Latest run, or null before the first sync. */
  last: {
    status: RunStatus;
    trigger: string;
    /** When it finished (or started, while running). */
    at: Date;
    durationMs: number | null;
    /** Records written to the mirror, all evidences together. */
    written: number;
    /** Records Flexi sent that couldn't be mapped. */
    invalid: number;
  } | null;
  lastSuccessAt: Date | null;
  /** Runs started in the window (default 7 days). */
  runs: number;
  succeeded: number;
  failed: number;
  /** Share of finished runs that succeeded, 0–100; null without finished runs. */
  successRate: number | null;
  /** A cron run in the window: the sync runs on its own. */
  automatic: boolean;
}

/** Runs older than this count as stuck, not running (matches getRunningFlexiSync). */
const STALE_RUNNING_MS = 30 * 60_000;

function runStatus(run: SyncRunInput, now: Date): RunStatus {
  if (run.status === 'success' || run.status === 'failed') return run.status;
  // A "running" run that never finished (process killed) is a failure.
  return now.getTime() - run.startedAt.getTime() > STALE_RUNNING_MS ? 'failed' : 'running';
}

/** Sums `written` and `invalid` over the evidences of a run's counts. */
export function runTotals(counts: unknown): { written: number; invalid: number } {
  const evidences = (counts as { evidences?: Record<string, { written?: unknown; invalid?: unknown }> } | null)
    ?.evidences;
  let written = 0;
  let invalid = 0;
  for (const ev of Object.values(evidences ?? {})) {
    if (typeof ev?.written === 'number') written += ev.written;
    if (typeof ev?.invalid === 'number') invalid += ev.invalid;
  }
  return { written, invalid };
}

/** Health of the mirror sync from the runs, newest first. */
export function summarizeFlexiRuns(runs: SyncRunInput[], now = new Date(), windowDays = 7): FlexiSyncHealth {
  const since = now.getTime() - windowDays * 86_400_000;
  const inWindow = runs.filter((r) => r.startedAt.getTime() >= since);
  const statuses = inWindow.map((r) => runStatus(r, now));
  const succeeded = statuses.filter((s) => s === 'success').length;
  const failed = statuses.filter((s) => s === 'failed').length;
  const finished = succeeded + failed;

  const first = runs[0];
  const lastSuccess = runs.find((r) => r.status === 'success');

  return {
    last: first
      ? {
          status: runStatus(first, now),
          trigger: first.trigger,
          at: first.finishedAt ?? first.startedAt,
          durationMs: first.finishedAt ? first.finishedAt.getTime() - first.startedAt.getTime() : null,
          ...runTotals(first.counts),
        }
      : null,
    lastSuccessAt: lastSuccess ? (lastSuccess.finishedAt ?? lastSuccess.startedAt) : null,
    runs: inWindow.length,
    succeeded,
    failed,
    successRate: finished ? Math.round((succeeded / finished) * 1000) / 10 : null,
    automatic: inWindow.some((r) => r.trigger === 'cron'),
  };
}
