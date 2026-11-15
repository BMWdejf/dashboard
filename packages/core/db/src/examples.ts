import { getDb } from './client';
import { toDashboard, type DashboardExamples } from './dashboard';

/** Reads every example row from Neon and groups it for the dashboard. */
export async function getDashboardExamples(): Promise<DashboardExamples> {
  const rows = await getDb().exampleData.findMany({
    orderBy: [{ section: 'asc' }, { position: 'asc' }],
  });
  return toDashboard(
    rows.map((r) => ({
      section: r.section,
      label: r.label,
      position: r.position,
      value: r.value.toNumber(),
      value2: r.value2?.toNumber() ?? null,
      changePct: r.changePct?.toNumber() ?? null,
      status: r.status,
      occurredAt: r.occurredAt,
    })),
  );
}
