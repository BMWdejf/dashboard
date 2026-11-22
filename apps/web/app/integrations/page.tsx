import { flexiEnv, shoptetEnv } from '@repo/core-config';
import {
  getIntegrationsOverview,
  listSupplierFeeds,
  type IntegrationsOverview,
  type Locale,
  type SupplierFeedSummary,
} from '@repo/core-db';
import Link from 'next/link';

import dash from '../dashboard/dashboard.module.css';
import { formatters, relative, type Formatters } from '../dashboard/format';
import { fill, intlLocale, type Dictionary } from '../../lib/i18n';
import { getI18n } from '../../lib/locale';
import styles from './integrations.module.css';
import { SyncAllButton } from './SyncAllButton';

// Reads the sync runs on every request (frame and session: layout.tsx).
export const dynamic = 'force-dynamic';

type T = Dictionary['integrations'];
type Kind = 'erp' | 'eshop' | 'feed';
type Status = 'connected' | 'running' | 'failed' | 'never' | 'notConnected';

const KINDS: Kind[] = ['erp', 'eshop', 'feed'];

/** One row of the table; built on the server, rendered without logic. */
interface Row {
  key: string;
  kind: Kind;
  name: string;
  endpoint: string | null;
  direction: 'pull' | 'push';
  cadence: string;
  payload: { value: number; unit: string } | null;
  heartbeat: { ago: string; time: string } | null;
  status: Status;
  /** Why the integration doesn't work yet (tooltip on the status). */
  note?: string;
  href?: string;
  /** Label of the row's link (href). */
  hrefLabel?: string;
}

/** "demo.flexibee.eu:5434/c/firma"; null when the env isn't set in the web app. */
function flexiEndpoint(): string | null {
  const env = flexiEnv.safeParse(process.env);
  if (!env.success) return null;
  return `${new URL(env.data.FLEXI_URL).host}/c/${env.data.FLEXI_COMPANY}`;
}

/** The Shoptet API host, only when a token is set. */
function shoptetEndpoint(): string | null {
  const env = shoptetEnv.safeParse(process.env);
  return env.success ? new URL(env.data.SHOPTET_API_URL).host : null;
}

/** "luzkovinysmolka.cz/heureka/export/products.xml" */
function feedEndpoint(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host.replace(/^www\./, '')}${u.pathname}`;
  } catch {
    return url;
  }
}

/** A stored import failure ({ code, params }) in the user's language. */
function feedFailure(error: string | null, t: T, codes: Record<string, string>): string | undefined {
  if (!error) return undefined;
  let f: { code?: string; params?: Record<string, string | number> } = {};
  try {
    f = JSON.parse(error) as typeof f;
  } catch {
    // Older or unexpected text: show the generic message.
  }
  const message = fill(codes[f.code ?? ''] ?? codes.internal ?? '', { reason: '', ...(f.params ?? {}) });
  return fill(t.feedFailed, { message });
}

function feedRows(feeds: SupplierFeedSummary[], t: T, codes: Record<string, string>, locale: Locale, now: number, time: Intl.DateTimeFormat): Row[] {
  if (feeds.length === 0) {
    return [
      {
        key: 'feed',
        kind: 'feed',
        name: t.items.feed,
        endpoint: null,
        direction: 'pull',
        cadence: t.cadence.none,
        payload: null,
        heartbeat: null,
        status: 'notConnected',
        note: t.notes.feed,
      },
    ];
  }
  return feeds.map((f) => ({
    key: `feed-${f.id}`,
    kind: 'feed' as const,
    name: f.name,
    endpoint: feedEndpoint(f.url),
    direction: 'pull' as const,
    cadence: f.importIntervalMinutes
      ? ((t.cadence as Record<string, string>)[String(f.importIntervalMinutes)] ?? t.cadence.cron)
      : t.cadence.manual,
    payload: { value: f.items, unit: t.payload.items },
    heartbeat: f.lastImportAt ? { ago: relative(f.lastImportAt, now, locale), time: time.format(f.lastImportAt) } : null,
    status:
      f.lastImportStatus === 'success'
        ? ('connected' as const)
        : f.lastImportStatus === 'running'
          ? ('running' as const)
          : f.lastImportStatus === 'failed'
            ? ('failed' as const)
            : ('never' as const),
    note: f.lastImportStatus === 'failed' ? feedFailure(f.lastImportError, t, codes) : undefined,
    href: `/integrations/feeds/${f.id}`,
    hrefLabel: t.openFeed,
  }));
}

function buildRows(
  o: IntegrationsOverview,
  feeds: SupplierFeedSummary[],
  t: T,
  codes: Record<string, string>,
  locale: Locale,
  now: number,
): Row[] {
  const time = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Prague',
  });
  const last = o.flexi.last;
  const flexiStatus: Status = !last
    ? 'never'
    : last.status === 'success'
      ? 'connected'
      : last.status === 'running'
        ? 'running'
        : 'failed';

  return [
    {
      key: 'flexi',
      kind: 'erp',
      name: t.items.flexi,
      endpoint: flexiEndpoint(),
      direction: 'pull',
      cadence: !last ? t.cadence.none : o.flexi.automatic ? t.cadence.cron : t.cadence.manual,
      payload: { value: o.mirroredProducts, unit: t.payload.products },
      heartbeat: last ? { ago: relative(last.at, now, locale), time: time.format(last.at) } : null,
      status: flexiStatus,
      href: '/products',
      hrefLabel: t.openProducts,
    },
    {
      key: 'shoptet',
      kind: 'eshop',
      name: t.items.shoptet,
      endpoint: shoptetEndpoint(),
      direction: 'push',
      cadence: t.cadence.none,
      payload: { value: o.shoptetConfigured, unit: t.payload.settings },
      heartbeat: null,
      status: 'notConnected',
      note: t.notes.shoptet,
    },
    ...feedRows(feeds, t, codes, locale, now, time),
  ];
}

function duration(ms: number | null, t: T, f: Formatters): string {
  if (ms === null) return t.kpi.none;
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 120 ? fill(t.seconds, { n: f.whole(s) }) : fill(t.minutes, { n: f.whole(Math.round(s / 60)) });
}

/** Database read and the time maths, outside render. */
async function load(t: T, codes: Record<string, string>, locale: Locale) {
  const [overview, feeds] = await Promise.all([
    getIntegrationsOverview().catch((e) => {
      console.error('integrations: overview failed', e instanceof Error ? e.message : e);
      return null;
    }),
    listSupplierFeeds().catch((e) => {
      console.error('integrations: feeds failed', e instanceof Error ? e.message : e);
      return [];
    }),
  ]);
  const now = Date.now();
  return { overview, now, rows: overview ? buildRows(overview, feeds, t, codes, locale, now) : [] };
}

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function IntegrationsPage({ searchParams }: { searchParams: Params }) {
  const { locale, t } = await getI18n();
  const ti = t.integrations;
  const f = formatters(locale);
  const sp = await searchParams;
  const typeParam = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const filter = KINDS.find((k) => k === typeParam) ?? null;

  const { overview, rows, now } = await load(ti, t.integrationsNew.codes, locale);
  const shown = filter ? rows.filter((r) => r.kind === filter) : rows;

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{ti.title}</h1>
            <span className={styles.pill}>{fill(ti.countPill, { n: f.whole(KINDS.length) })}</span>
          </div>
          <p className={styles.subtitle}>{ti.subtitle}</p>
        </div>
        <div className={styles.topActions}>
          <Link href="/integrations/new" className={styles.secondary}>
            <span className={styles.plusIcon} aria-hidden />
            {ti.add}
          </Link>
          <div className={styles.syncRow}>
            <SyncAllButton labels={{ syncAll: ti.syncAll, syncAllHint: ti.syncAllHint, syncing: ti.syncing }} />
          </div>
          {overview && (
            <p className={styles.autoSync}>
              <span className={styles.liveDot} aria-hidden />
              {overview.flexi.automatic ? ti.autoSync : ti.manualSync}
            </p>
          )}
        </div>
      </header>

      {!overview ? (
        <p className={`${styles.tableCard} ${styles.message}`} role="alert">
          {ti.loadError}
        </p>
      ) : (
        <>
          <Kpis o={overview} rows={rows} t={ti} f={f} locale={locale} now={now} />

          <section className={styles.tableCard} aria-labelledby="integrations-title">
            <div className={styles.tableHead}>
              <div className={styles.filters}>
                <h2 id="integrations-title">{ti.table.title}</h2>
                <nav className={styles.pills} aria-label={ti.table.filter}>
                  <FilterPill to={null} active={filter === null} label={fill(ti.table.all, { n: rows.length })} />
                  {KINDS.map((k) => (
                    <FilterPill
                      key={k}
                      to={k}
                      active={filter === k}
                      label={fill(ti.table[k], { n: rows.filter((r) => r.kind === k).length })}
                    />
                  ))}
                </nav>
              </div>
              <p className={styles.range}>
                {shown.length > 0 &&
                  fill(ti.table.range, { from: 1, to: shown.length, total: shown.length })}
              </p>
            </div>

            {shown.length === 0 ? (
              <p className={styles.message}>{ti.table.empty}</p>
            ) : (
              <IntegrationTable rows={shown} t={ti} f={f} />
            )}

            <footer className={styles.tableFoot}>
              <p>
                {fill(ti.table.footer, {
                  range: shown.length ? `1 – ${shown.length}` : '0',
                  total: String(shown.length),
                })}
              </p>
            </footer>
          </section>

          <Strip o={overview} t={ti} f={f} locale={locale} now={now} />
        </>
      )}
    </div>
  );
}

function FilterPill({ to, active, label }: { to: Kind | null; active: boolean; label: string }) {
  return (
    <Link
      href={to ? `/integrations?type=${to}` : '/integrations'}
      className={styles.filterPill}
      aria-current={active ? 'page' : undefined}
      scroll={false}
    >
      {label}
    </Link>
  );
}

const TONES = ['toneAccent', 'toneInfo', 'toneOk', 'toneWarn'] as const;

function Kpis({
  o,
  rows,
  t,
  f,
  locale,
  now,
}: {
  o: IntegrationsOverview;
  rows: Row[];
  t: T;
  f: Formatters;
  locale: Locale;
  now: number;
}) {
  const total = rows.length;
  const active = rows.filter((r) => r.status === 'connected' || r.status === 'running').length;
  const configured = rows.filter((r) => r.endpoint !== null || r.status !== 'notConnected').length;
  // Endpoints that have been connected at least once: Flexi after its first run.
  const linked = rows.filter((r) => r.status === 'connected' || r.status === 'running' || r.status === 'failed');
  const healthy = linked.length - linked.filter((r) => r.status === 'failed').length;
  const last = o.flexi.last;
  const lastFailed = last?.status === 'failed';

  const cards: { label: string; value: string; badge: string; meta: [string, string]; warn?: boolean }[] = [
    {
      label: t.kpi.active,
      value: f.whole(active),
      badge: fill(t.kpi.activeBadge, { total: f.whole(total) }),
      meta: [t.kpi.configured, fill(t.kpi.configuredValue, { n: f.whole(configured), total: f.whole(total) })],
    },
    {
      label: t.kpi.synced,
      value: f.whole(o.mirroredProducts),
      badge: fill(t.kpi.syncedBadge, { n: f.whole(last?.written ?? 0) }),
      meta: [t.kpi.lastRun, last ? relative(last.at, now, locale) : t.kpi.none],
    },
    {
      label: t.kpi.healthy,
      value: `${f.whole(healthy)} / ${f.whole(linked.length)}`,
      badge: fill(t.kpi.healthyBadge, {
        pct: linked.length ? f.share(Math.round((healthy / linked.length) * 1000) / 10) : t.kpi.none,
      }),
      meta: [t.kpi.duration, duration(last?.durationMs ?? null, t, f)],
    },
    {
      label: t.kpi.warnings,
      value: f.whole(o.flexi.failed),
      badge: t.kpi.warningsBadge,
      meta: [t.kpi.status, lastFailed && last ? fill(t.kpi.statusFailed, { ago: relative(last.at, now, locale) }) : t.kpi.statusOk],
      warn: o.flexi.failed > 0,
    },
  ];

  return (
    <section className={styles.kpis} aria-label={t.kpisLabel}>
      {cards.map((c, i) => (
        <article key={c.label} className={`${styles.kpi} ${styles[TONES[i]!]}`}>
          <h2 className={styles.kpiLabel}>{c.label}</h2>
          <p className={styles.kpiValue}>
            {c.value}
            <span className={`${styles.kpiBadge} ${c.warn ? styles.kpiBadgeWarn : ''}`}>{c.badge}</span>
          </p>
          <dl className={styles.kpiMeta}>
            <dt>{c.meta[0]}</dt>
            <dd title={c.meta[1]}>{c.meta[1]}</dd>
          </dl>
        </article>
      ))}
    </section>
  );
}

const STATUS_CLASS: Record<Status, string> = {
  connected: 'statusOk',
  running: 'statusRunning',
  failed: 'statusFailed',
  never: 'statusIdle',
  notConnected: 'statusIdle',
};

function IntegrationTable({ rows, t, f }: { rows: Row[]; t: T; f: Formatters }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t.table.integration}</th>
            <th scope="col">{t.table.type}</th>
            <th scope="col">{t.table.cadence}</th>
            <th scope="col" className={styles.num}>
              {t.table.payload}
            </th>
            <th scope="col">{t.table.heartbeat}</th>
            <th scope="col">{t.table.status}</th>
            <th scope="col">
              <span className={dash.visuallyHidden}>{t.table.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                <div className={styles.integration}>
                  <span className={`${styles.logo} ${styles[`logo_${r.kind}`]}`} aria-hidden>
                    {r.name.charAt(0)}
                  </span>
                  <span className={styles.integrationText}>
                    <span className={styles.name}>{r.name}</span>
                    <span className={`${styles.endpoint} ${r.endpoint ? '' : styles.muted}`} title={r.endpoint ?? undefined}>
                      {r.endpoint ?? (r.status === 'notConnected' ? t.table.notSet : t.table.viaApi)}
                    </span>
                  </span>
                </div>
              </td>
              <td>
                <span className={`${styles.type} ${styles[`type_${r.kind}`]}`}>{t.types[r.kind]}</span>
              </td>
              <td>
                <span className={styles.stack}>
                  <span>{t.direction[r.direction]}</span>
                  <span className={styles.sub}>{r.cadence}</span>
                </span>
              </td>
              <td className={styles.num}>
                {r.payload ? (
                  <span className={styles.stack}>
                    <strong className={styles.payload}>{f.whole(r.payload.value)}</strong>
                    <span className={styles.sub}>{r.payload.unit}</span>
                  </span>
                ) : (
                  <span className={styles.muted}>—</span>
                )}
              </td>
              <td>
                {r.heartbeat ? (
                  <span className={styles.stack}>
                    <span>{r.heartbeat.ago}</span>
                    <span className={`${styles.sub} ${styles.mono}`}>{r.heartbeat.time}</span>
                  </span>
                ) : (
                  <span className={styles.muted}>{t.table.never}</span>
                )}
              </td>
              <td>
                <span className={`${styles.status} ${styles[STATUS_CLASS[r.status]]}`} title={r.note}>
                  {t.status[r.status]}
                </span>
              </td>
              <td className={styles.actionsCell}>
                {r.href ? (
                  <Link href={r.href} className={styles.iconButton} aria-label={`${r.hrefLabel}: ${r.name}`} title={r.hrefLabel}>
                    <span className={styles.arrowIcon} aria-hidden />
                  </Link>
                ) : (
                  <span className={styles.iconButton} aria-disabled="true" title={t.configure}>
                    <span aria-hidden>⋯</span>
                    <span className={dash.visuallyHidden}>{t.configure}</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Strip({
  o,
  t,
  f,
  locale,
  now,
}: {
  o: IntegrationsOverview;
  t: T;
  f: Formatters;
  locale: Locale;
  now: number;
}) {
  const last = o.flexi.last;
  const state = !last ? 'never' : last.status === 'success' ? 'active' : last.status;
  const trigger = last ? ((t.triggers as Record<string, string>)[last.trigger] ?? last.trigger) : '';
  return (
    <section className={styles.strip} aria-label={t.strip.label}>
      <div className={styles.stripMain}>
        <span className={`${styles.stripDot} ${styles[`dot_${state}`]}`} aria-hidden />
        <div>
          <p className={styles.stripTitle}>{t.strip[state]}</p>
          <p className={styles.stripDetail}>
            {last ? fill(t.strip.detail, { ago: relative(last.at, now, locale), trigger }) : t.strip.detailNone}
          </p>
        </div>
      </div>
      <dl className={styles.stripStats}>
        <div>
          <dt>{t.strip.written}</dt>
          <dd>
            {last ? f.whole(last.written) : '—'} <span>{t.strip.records}</span>
          </dd>
        </div>
        <div>
          <dt>{t.strip.successRate}</dt>
          <dd>{o.flexi.successRate === null ? '—' : f.share(o.flexi.successRate)}</dd>
        </div>
        <div>
          <dt>{t.strip.invalid}</dt>
          <dd>{last ? f.whole(last.invalid) : '—'}</dd>
        </div>
      </dl>
    </section>
  );
}
