import { getDb } from './client';
import { summarizeFlexiRuns, type FlexiSyncHealth } from './integrations-logic';

export interface IntegrationsOverview {
  flexi: FlexiSyncHealth;
  /** Products in the Flexi mirror (flexi_cenik). */
  mirroredProducts: number;
  /** Products with Shoptet settings saved on their detail page. */
  shoptetConfigured: number;
}

/** Everything the /integrations page reads from the database, in one go. */
export async function getIntegrationsOverview(now = new Date()): Promise<IntegrationsOverview> {
  const db = getDb();
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [latest, lastSuccess, recent, mirroredProducts, shoptetConfigured] = await Promise.all([
    // The newest run and the last success may be older than the window.
    db.flexiSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    db.flexiSyncRun.findFirst({ where: { status: 'success' }, orderBy: { startedAt: 'desc' } }),
    db.flexiSyncRun.findMany({ where: { startedAt: { gte: since } }, orderBy: { startedAt: 'desc' }, take: 500 }),
    db.flexiCenik.count(),
    db.shoptetProductSettings.count(),
  ]);
  // Newest first, without duplicates, for the summary.
  const all = [...(latest ? [latest] : []), ...(lastSuccess ? [lastSuccess] : []), ...recent];
  const byId = new Map(all.map((r) => [r.id, r]));
  const runs = [...byId.values()].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  return { flexi: summarizeFlexiRuns(runs, now), mirroredProducts, shoptetConfigured };
}
