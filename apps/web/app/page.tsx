import { getDashboardExamples, type DashboardExamples } from '@repo/core-db';
import { redirect } from 'next/navigation';

import { BarChart, deviceColor, Gauge, LineChart, Sparkline } from './dashboard/charts';
import { DashboardShell } from './dashboard/DashboardShell';
import styles from './dashboard/dashboard.module.css';
import { formatters } from './dashboard/format';
import { getAuth } from '../lib/auth/server';
import { fill } from '../lib/i18n';
import { getI18n } from '../lib/locale';

// Reads the session and the example data on every request.
export const dynamic = 'force-dynamic';

function Trend({ value, format }: { value: number | null; format: (n: number) => string }) {
  if (value === null) return null;
  return <span className={value >= 0 ? styles.trendUp : styles.trendDown}>{format(value)}</span>;
}

/** Label from a dictionary map, or the raw label when it isn't translated. */
const label = (map: Record<string, string>, key: string) => map[key] ?? key;

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
  const { locale, t } = await getI18n();
  const h = t.home;
  const f = formatters(locale);
  const fmtCompact = f.compact;
  const fmtWhole = f.whole;
  const fmtMoney = f.money;
  const fmtMoneyCompact = f.moneyCompact;
  const fmtDate = f.date;

  return (
    <DashboardShell user={user} active="/">
      <header className={styles.header}>
        <p className={styles.eyebrow}>{h.eyebrow}</p>
        <h1 className={styles.title}>{fill(h.welcome, { name: user.name })}</h1>
        <p className={styles.subtitle}>
          {h.subtitle}
          <span className={styles.exampleTag}>{h.exampleTag}</span>
        </p>
      </header>

      {!data ? (
        <section className={styles.card} role="alert">
          <h2 className={styles.cardTitle}>{h.loadErrorTitle}</h2>
          <p className={styles.cardText}>{h.loadErrorText}</p>
        </section>
      ) : (
        <div className={styles.stack}>
          <section className={styles.kpis} aria-label={h.kpisLabel}>
            {data.kpis.map((k) => (
              <article key={k.label} className={styles.card}>
                <h2 className={styles.cardTitle}>{label(h.kpi, k.label)}</h2>
                <p className={styles.metric}>
                  {fmtCompact(k.value)} <Trend value={k.changePct} format={f.pct} />
                </p>
              </article>
            ))}
          </section>

          <div className={styles.row}>
            <article className={`${styles.card} ${styles.wide}`}>
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>{h.totalRevenue}</h2>
                  <p className={styles.metric}>
                    {data.summary.totalRevenue !== null
                      ? fmtMoneyCompact(data.summary.totalRevenue)
                      : '—'}{' '}
                    <Trend value={data.summary.totalRevenueChange} format={f.pct} />
                  </p>
                </div>
                <ul className={styles.legend}>
                  <li>
                    <span className={styles.legendRevenue} /> {h.revenue}
                  </li>
                  <li>
                    <span className={styles.legendExpenses} /> {h.expenses}
                  </li>
                </ul>
              </div>
              <LineChart
                label={h.revenueChart}
                labels={data.revenue.map((r) => r.label)}
                series={[
                  { label: h.revenue, color: 'var(--chart-1)', values: data.revenue.map((r) => r.revenue) },
                  { label: h.expenses, color: 'var(--chart-2)', values: data.revenue.map((r) => r.expenses) },
                ]}
                formatTick={(n) => fmtMoneyCompact(n)}
              />
            </article>

            <div className={styles.column}>
              <article className={styles.card}>
                <h2 className={styles.cardTitle}>{h.totalProfit}</h2>
                <p className={styles.metric}>
                  {data.summary.totalProfit !== null ? fmtMoneyCompact(data.summary.totalProfit) : '—'}{' '}
                  <Trend value={data.summary.totalProfitChange} format={f.pct} />
                </p>
                <BarChart label={h.profitChart} points={data.profit} />
              </article>
              <article className={styles.card}>
                <h2 className={styles.cardTitle}>{h.totalSessions}</h2>
                <p className={styles.metric}>
                  {data.summary.totalSessions !== null ? fmtWhole(data.summary.totalSessions) : '—'}{' '}
                  <Trend value={data.summary.totalSessionsChange} format={f.pct} />
                </p>
                <Sparkline label={h.sessionsChart} points={data.sessions} />
                {data.summary.visitors !== null && (
                  <p className={styles.cardText}>
                    {fill(h.visitors, { n: fmtCompact(data.summary.visitors) })}
                  </p>
                )}
              </article>
            </div>
          </div>

          <div className={styles.row}>
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>{h.byDevice}</h2>
              <Gauge
                parts={data.devices}
                total={fmtWhole(data.devices.reduce((a, d) => a + d.value, 0))}
              />
              <ul className={styles.deviceList}>
                {data.devices.map((d, i) => (
                  <li key={d.label}>
                    <span className={styles.swatch} style={{ background: deviceColor(i) }} />
                    {label(h.devices, d.label)}
                    <strong>{fmtWhole(d.value)}</strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className={`${styles.card} ${styles.wide}`}>
              <h2 className={styles.cardTitle}>{h.byCountry}</h2>
              <p className={styles.metric}>
                {data.summary.countryUsers !== null ? fmtCompact(data.summary.countryUsers) : '—'}{' '}
                <Trend value={data.summary.countryUsersChange} format={f.pct} />
              </p>
              <ul className={styles.countries}>
                {data.countries.map((c) => (
                  <li key={c.label}>
                    <span className={styles.countryName}>{c.label}</span>
                    <span className={styles.bar}>
                      <span style={{ width: `${Math.min(100, c.share)}%` }} />
                    </span>
                    <span className={styles.countryShare}>{f.share(c.share)}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>

          <article className={styles.card}>
            <h2 className={styles.cardTitle}>{h.lastOrders}</h2>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">{h.order}</th>
                    <th scope="col">{h.date}</th>
                    <th scope="col">{h.status}</th>
                    <th scope="col" className={styles.num}>
                      {h.total}
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
                          {label(h.orderStatus, o.status)}
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
