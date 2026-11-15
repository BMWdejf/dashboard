/** A row of examples_data with numbers instead of Prisma decimals. */
export interface ExampleRow {
  section: string;
  label: string;
  position: number;
  value: number;
  value2: number | null;
  changePct: number | null;
  status: string | null;
  occurredAt: Date | null;
}

export interface Kpi {
  label: string;
  value: number;
  changePct: number | null;
}

export interface Point {
  label: string;
  value: number;
}

export interface DashboardExamples {
  summary: {
    totalRevenue: number | null;
    totalRevenueChange: number | null;
    totalProfit: number | null;
    totalProfitChange: number | null;
    totalSessions: number | null;
    totalSessionsChange: number | null;
    visitors: number | null;
    countryUsers: number | null;
    countryUsersChange: number | null;
  };
  kpis: Kpi[];
  revenue: { label: string; revenue: number; expenses: number }[];
  profit: Point[];
  sessions: Point[];
  devices: Point[];
  countries: { label: string; share: number; users: number | null }[];
  orders: { code: string; total: number; status: string; date: Date | null }[];
}

/** Groups examples_data rows into the dashboard's widgets. Pure. */
export function toDashboard(rows: ExampleRow[]): DashboardExamples {
  const of = (section: string) =>
    rows.filter((r) => r.section === section).sort((a, b) => a.position - b.position);
  const summary = new Map(of('summary').map((r) => [r.label, r]));
  const s = (key: string) => summary.get(key);

  return {
    summary: {
      totalRevenue: s('total_revenue')?.value ?? null,
      totalRevenueChange: s('total_revenue')?.changePct ?? null,
      totalProfit: s('total_profit')?.value ?? null,
      totalProfitChange: s('total_profit')?.changePct ?? null,
      totalSessions: s('total_sessions')?.value ?? null,
      totalSessionsChange: s('total_sessions')?.changePct ?? null,
      visitors: s('visitors')?.value ?? null,
      countryUsers: s('country_users')?.value ?? null,
      countryUsersChange: s('country_users')?.changePct ?? null,
    },
    kpis: of('kpi').map((r) => ({ label: r.label, value: r.value, changePct: r.changePct })),
    revenue: of('revenue').map((r) => ({
      label: r.label,
      revenue: r.value,
      expenses: r.value2 ?? 0,
    })),
    profit: of('profit').map((r) => ({ label: r.label, value: r.value })),
    sessions: of('sessions').map((r) => ({ label: r.label, value: r.value })),
    devices: of('device').map((r) => ({ label: r.label, value: r.value })),
    countries: of('country').map((r) => ({ label: r.label, share: r.value, users: r.value2 })),
    orders: of('order').map((r) => ({
      code: r.label,
      total: r.value,
      status: r.status ?? 'unknown',
      date: r.occurredAt,
    })),
  };
}
