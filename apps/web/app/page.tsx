import { getDashboardExamples, type DashboardExamples } from '@repo/core-db';
import { redirect } from 'next/navigation';

import { BarChart, deviceColor, Gauge, LineChart, Sparkline } from './dashboard/charts';
import { DashboardShell } from './dashboard/DashboardShell';
import styles from './dashboard/dashboard.module.css';
import {
  fmtCompact,
  fmtDate,
  fmtMoney,
  fmtMoneyCompact,
  fmtPct,
  fmtWhole,
} from './dashboard/format';
import { getAuth } from '../lib/auth/server';

// Reads the session and the example data on every request.
export const dynamic = 'force-dynamic';

const KPI_LABELS: Record<string, string> = {
  Pageviews: 'Zobrazení stránek',
  'Monthly users': 'Měsíční uživatelé',
  'New sign ups': 'Nové registrace',
  Subscriptions: 'Předplatné',
};

const STATUS: Record<string, string> = { paid: 'Zaplaceno', pending: 'Čeká' };

function Trend({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <span className={value >= 0 ? styles.trendUp : styles.trendDown}>{fmtPct(value)}</span>
  );
}

async function loadData(): Promise<DashboardExamples | null> {
  try {
    return await getDashboardExamples();
  } catch (e) {
    console.error('dashboard: loading examples_data failed', e instanceof Error ? e.message : e);
    return null;
  }
}

export default async function DashboardPage() {
  const { data: session } = await getAuth().getSession();
  // The proxy redirects too, but the page checks the session itself.
  if (!session?.user) redirect('/auth/sign-in');
  const { user } = session;
  const data = await loadData();

  return (
    <DashboardShell user={user} active="/">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Přehled reportů</p>
        <h1 className={styles.title}>Vítejte zpět, {user.name}</h1>
        <p className={styles.subtitle}>
          Měřte návratnost reklamy a sledujte návštěvnost webu.
          <span className={styles.exampleTag}>Ukázková data z tabulky examples_data</span>
        </p>
      </header>

      {!data ? (
        <section className={styles.card} role="alert">
          <h2 className={styles.cardTitle}>Data se nepodařilo načíst</h2>
          <p className={styles.cardText}>
            Dashboard nemá spojení s databází. Zkontrolujte proměnnou DATABASE_URL a že je v
            databázi tabulka examples_data.
          </p>
        </section>
      ) : (
        <div className={styles.stack}>
          <section className={styles.kpis} aria-label="Klíčové ukazatele">
            {data.kpis.map((k) => (
              <article key={k.label} className={styles.card}>
                <h2 className={styles.cardTitle}>{KPI_LABELS[k.label] ?? k.label}</h2>
                <p className={styles.metric}>
                  {fmtCompact(k.value)} <Trend value={k.changePct} />
                </p>
              </article>
            ))}
          </section>

          <div className={styles.row}>
            <article className={`${styles.card} ${styles.wide}`}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>Celkové tržby</h2>
                  <p className={styles.metric}>
                    {data.summary.totalRevenue !== null
                      ? fmtMoneyCompact(data.summary.totalRevenue)
                      : '—'}{' '}
                    <Trend value={data.summary.totalRevenueChange} />
                  </p>
                </div>
                <ul className={styles.legend}>
                  <li>
                    <span className={styles.legendRevenue} /> Tržby
                  </li>
                  <li>
                    <span className={styles.legendExpenses} /> Náklady
                  </li>
                </ul>
              </div>
              <LineChart
                label="Tržby a náklady po měsících"
                labels={data.revenue.map((r) => r.label)}
                series={[
                  { label: 'Tržby', color: 'var(--chart-1)', values: data.revenue.map((r) => r.revenue) },
                  { label: 'Náklady', color: 'var(--chart-2)', values: data.revenue.map((r) => r.expenses) },
                ]}
                formatTick={(n) => fmtMoneyCompact(n)}
              />
            </article>

            <div className={styles.column}>
              <article className={styles.card}>
                <h2 className={styles.cardTitle}>Celkový zisk · posledních 12 měsíců</h2>
                <p className={styles.metric}>
                  {data.summary.totalProfit !== null ? fmtMoneyCompact(data.summary.totalProfit) : '—'}{' '}
                  <Trend value={data.summary.totalProfitChange} />
                </p>
                <BarChart label="Zisk po měsících" points={data.profit} />
              </article>
              <article className={styles.card}>
                <h2 className={styles.cardTitle}>Celkem relací</h2>
                <p className={styles.metric}>
                  {data.summary.totalSessions !== null ? fmtWhole(data.summary.totalSessions) : '—'}{' '}
                  <Trend value={data.summary.totalSessionsChange} />
                </p>
                <Sparkline label="Relace během dne" points={data.sessions} />
                {data.summary.visitors !== null && (
                  <p className={styles.cardText}>{fmtCompact(data.summary.visitors)} návštěvníků</p>
                )}
              </article>
            </div>
          </div>

          <div className={styles.row}>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>Uživatelé podle zařízení</h2>
              <Gauge
                parts={data.devices}
                total={fmtWhole(data.devices.reduce((a, d) => a + d.value, 0))}
              />
              <ul className={styles.deviceList}>
                {data.devices.map((d, i) => (
                  <li key={d.label}>
                    <span className={styles.swatch} style={{ background: deviceColor(i) }} />
                    {d.label === 'Desktop users'
                      ? 'Počítače'
                      : d.label === 'Phone app users'
                        ? 'Mobilní aplikace'
                        : d.label === 'Laptop users'
                          ? 'Notebooky'
                          : d.label}
                    <strong>{fmtWhole(d.value)}</strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className={`${styles.card} ${styles.wide}`}>
              <h2 className={styles.cardTitle}>Uživatelé podle země</h2>
              <p className={styles.metric}>
                {data.summary.countryUsers !== null ? fmtCompact(data.summary.countryUsers) : '—'}{' '}
                <Trend value={data.summary.countryUsersChange} />
              </p>
              <ul className={styles.countries}>
                {data.countries.map((c) => (
                  <li key={c.label}>
                    <span className={styles.countryName}>{c.label}</span>
                    <span className={styles.bar}>
                      <span style={{ width: `${Math.min(100, c.share)}%` }} />
                    </span>
                    <span className={styles.countryShare}>{c.share} %</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>

          <article className={styles.card}>
            <h2 className={styles.cardTitle}>Poslední objednávky</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Objednávka</th>
                    <th scope="col">Datum</th>
                    <th scope="col">Stav</th>
                    <th scope="col" className={styles.num}>
                      Celkem
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.code}>
                      <td>{o.code}</td>
                      <td>{fmtDate(o.date)}</td>
                      <td>
                        <span className={o.status === 'paid' ? styles.badgePaid : styles.badgePending}>
                          {STATUS[o.status] ?? o.status}
                        </span>
                      </td>
                      <td className={styles.num}>{fmtMoney(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      )}
    </DashboardShell>
  );
}
