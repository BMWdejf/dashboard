/**
 * Manual Flexi → Neon sync, for testing:
 *   pnpm --filter api sync:flexi           changes since the last run
 *   pnpm --filter api sync:flexi --full    everything, and remove what Flexi deleted
 *   pnpm --filter api sync:flexi --backfill-history[=400]
 *       rebuild the stock history from movements (runs once by itself)
 * Reads FLEXI_* and DATABASE_URL from the environment (root .env.local).
 */
import { DEFAULT_BACKFILL_DAYS, runFlexiMirrorSync, safeError } from '@repo/core-sync';

import { createFlexiSyncDeps } from '../flexi-sync/flexi-sync.deps';

async function main() {
  const full = process.argv.includes('--full');
  const backfillArg = process.argv.find((a) => a.startsWith('--backfill-history'));
  const backfillHistoryDays = backfillArg
    ? Number(backfillArg.split('=')[1] ?? DEFAULT_BACKFILL_DAYS)
    : undefined;
  if (backfillHistoryDays !== undefined && !(Number.isInteger(backfillHistoryDays) && backfillHistoryDays > 0)) {
    throw new Error('--backfill-history takes a whole number of days, e.g. --backfill-history=400');
  }
  const started = Date.now();
  const { flexi, store } = createFlexiSyncDeps();
  const { runId, counts } = await runFlexiMirrorSync({
    flexi,
    store,
    trigger: 'script',
    full,
    backfillHistoryDays,
    log: (msg) => console.log(msg),
  });
  console.log(`\nrun ${runId} (${full ? 'full' : 'incremental'}) in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  console.table(counts.evidences);
  console.log(`period: ${counts.period ?? '-'}, stock history rows: ${counts.stockHistoryRows ?? 0}, changes: ${counts.changes ?? '-'}`);
  if (counts.historyBackfill) {
    const b = counts.historyBackfill;
    console.log(`history backfill since ${b.since}: ${b.movements} movements → ${b.rows} rows`);
  }
  if (counts.errors.length) console.log('errors:\n  ' + counts.errors.join('\n  '));
}

main().catch((e) => {
  console.error(`sync failed: ${safeError(e)}`);
  process.exitCode = 1;
});
