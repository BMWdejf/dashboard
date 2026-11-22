import {
  DEFAULT_PRODUCT_SETTINGS,
  getLastFlexiSync,
  getProductFilterOptions,
  getProductKpis,
  getProductSparklines,
  getUserPreferences,
  listProducts,
  parseProductFilters,
  PER_PAGE_OPTIONS,
  type FilterOption,
  type ProductFilter,
  type ProductKpi,
  type ProductKpis,
  type ProductListRow,
  type ProductSettings,
  type ProductSparklines,
  type StockStatus,
  withFilters,
} from '@repo/core-db';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import dash from '../dashboard/dashboard.module.css';
import { formatters, type Formatters } from '../dashboard/format';
import { getAuth } from '../../lib/auth/server';
import { fill, type Dictionary } from '../../lib/i18n';
import { getI18n } from '../../lib/locale';
import { describeFilter, filtersHref } from './filter-chips';
import { PerPageSelect } from './PerPageSelect';
import { ProductFilters, type FilterChoices } from './ProductFilters';
import { ProductSearch } from './ProductSearch';
import { RowActions } from './RowActions';
import { Sparkline } from './Sparkline';
import styles from './products.module.css';

// Reads the session and the Flexi mirror on every request (frame: layout.tsx).
export const dynamic = 'force-dynamic';

type Params = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The list's state as URL params (search, filters, page size), without the page. */
function listParams(q: string, per: number, filters: readonly ProductFilter[]): URLSearchParams {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (per !== PER_PAGE_OPTIONS[0]) params.set('per', String(per));
  return withFilters(params, filters);
}

/** Link to a page of the list, keeping the search, filters and page size. */
function href(base: URLSearchParams, page: number): string {
  const params = new URLSearchParams(base);
  if (page > 1) params.set('page', String(page));
  const s = params.toString();
  return s ? `/products?${s}` : '/products';
}

const choiceLabel = (o: FilterOption) => (o.nazev && o.nazev !== o.kod ? `${o.nazev} (${o.kod})` : o.kod);

export default async function ProductsPage({ searchParams }: { searchParams: Params }) {
  const { data: session } = await getAuth().getSession();
  // The proxy redirects too, but the page checks the session itself.
  if (!session?.user) redirect('/auth/sign-in');
  const { user } = session;
  const { locale, t } = await getI18n();
  const p = t.products;
  const f = formatters(locale);

  const sp = await searchParams;
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const perRaw = Number(one(sp.per));
  const per = (PER_PAGE_OPTIONS as readonly number[]).includes(perRaw) ? perRaw : PER_PAGE_OPTIONS[0];
  const pageRaw = Number(one(sp.page) ?? 1);
  const filters = parseProductFilters(sp);
  const base = listParams(q, per, filters);

  const prefs = await getUserPreferences(user.id).catch(() => null);
  const settings: ProductSettings = prefs?.productSettings ?? DEFAULT_PRODUCT_SETTINGS;
  const priceMode = prefs?.priceMode ?? 'withVat';

  const [list, kpis, sparks, lastSync, options] = await Promise.all([
    listProducts({ q, filters, page: pageRaw, perPage: per, priceMode, settings }).catch((e) => {
      console.error('products: list failed', e instanceof Error ? e.message : e);
      return null;
    }),
    getProductKpis(settings).catch((e) => {
      console.error('products: kpis failed', e instanceof Error ? e.message : e);
      return null;
    }),
    getProductSparklines(settings).catch((e) => {
      console.error('products: sparklines failed', e instanceof Error ? e.message : e);
      return null;
    }),
    loadSync(),
    getProductFilterOptions().catch((e) => {
      console.error('products: filter options failed', e instanceof Error ? e.message : e);
      return { groups: [], units: [], tags: [] };
    }),
  ]);
  const choices: FilterChoices = {
    groups: options.groups.map((o) => ({ id: o.id, label: choiceLabel(o) })),
    units: options.units.map((o) => ({ id: o.id, label: choiceLabel(o) })),
    tags: options.tags,
  };
  const fl = p.filters;

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{p.title}</h1>
        <div className={styles.actions}>
          <ProductSearch
            initial={q}
            label={p.searchLabel}
            placeholder={p.searchPlaceholder}
            submitLabel={p.search}
          />
          <button type="button" className={styles.cta} aria-disabled="true" title={p.addDisabled} aria-describedby="add-hint">
            {p.add}
          </button>
          <span id="add-hint" className={dash.visuallyHidden}>
            {p.addDisabled}
          </span>
        </div>
      </header>

      <div className={styles.body}>
        {kpis && <KpiCards kpis={kpis} sparks={sparks} settings={settings} t={p} f={f} />}

        <section className={styles.tableCard} aria-labelledby="products-title">
          <div className={styles.tableHead}>
            <div className={styles.tableTitle}>
              <h2 id="products-title">{p.table.title}</h2>
              <SyncBadge sync={lastSync} t={p.sync} f={f} />
            </div>
            <ProductFilters filters={filters} choices={choices} labels={fl} />
          </div>

          {filters.length > 0 && (
            <div className={styles.chips} aria-label={fl.active} role="group">
              {list && <span className={styles.chipsCount}>{fill(fl.found, { total: f.whole(list.total) })}</span>}
              {filters.map((flt) => {
                const text = describeFilter(flt, fl, choices, {
                  number: (n) => f.qty(String(n)),
                  day: f.day,
                });
                return (
                  <Link
                    key={flt.key}
                    href={filtersHref(base, filters.filter((x) => x !== flt))}
                    className={styles.chip}
                    aria-label={fill(fl.removeChip, { field: text })}
                    title={fill(fl.removeChip, { field: text })}
                  >
                    {text}
                    <span aria-hidden className={styles.chipX}>×</span>
                  </Link>
                );
              })}
              <Link href={filtersHref(base, [])} className={styles.chipsClear}>
                {fl.clear}
              </Link>
            </div>
          )}

          {!list ? (
            <p className={styles.message} role="alert">
              {p.table.error}
            </p>
          ) : list.total === 0 ? (
            filters.length ? (
              <p className={styles.message}>
                {fl.noResults} <Link href={filtersHref(base, [])}>{fl.clear}</Link>
              </p>
            ) : q ? (
              <p className={styles.message}>
                {fill(p.table.noResults, { q })} <Link href={href(listParams('', per, filters), 1)}>{p.table.clearSearch}</Link>
              </p>
            ) : (
              <p className={styles.message}>
                {p.table.empty} <code>pnpm --filter api sync:flexi</code>
              </p>
            )
          ) : (
            <ProductTable rows={list.rows} priceMode={priceMode} t={p} f={f} />
          )}
        </section>

        {list && list.total > 0 && (
          <footer className={styles.footer}>
            <p className={styles.range}>
              {fill(p.table.range, {
                from: f.whole((list.page - 1) * per + 1),
                to: f.whole(Math.min(list.page * per, list.total)),
                total: f.whole(list.total),
              })}
            </p>
            <div className={styles.pager}>
              <PerPageSelect label={p.table.rowsPerPage} value={per} options={[...PER_PAGE_OPTIONS]} />
              <nav className={styles.pageLinks} aria-label={p.table.pagination}>
                <PageLink
                  to={list.page > 1 ? href(base, list.page - 1) : null}
                  label={p.table.prev}
                  dir="prev"
                />
                <PageLink
                  to={list.page * per < list.total ? href(base, list.page + 1) : null}
                  label={p.table.next}
                  dir="next"
                />
              </nav>
            </div>
          </footer>
        )}
      </div>
    </>
  );
}

function PageLink({ to, label, dir }: { to: string | null; label: string; dir: 'prev' | 'next' }) {
  const icon = <span className={dir === 'prev' ? styles.chevronLeft : styles.chevronRight} aria-hidden />;
  return to ? (
    <Link href={to} className={styles.pageLink} aria-label={label} title={label}>
      {icon}
    </Link>
  ) : (
    <span className={styles.pageLink} aria-disabled="true" title={label}>
      {icon}
    </span>
  );
}

const KPI_TONE = ['toneAccent', 'toneInfo', 'toneSecondary', 'toneDanger'] as const;

function KpiCards({
  kpis,
  sparks,
  settings,
  t,
  f,
}: {
  kpis: ProductKpis;
  sparks: ProductSparklines | null;
  settings: ProductSettings;
  t: Dictionary['products'];
  f: Formatters;
}) {
  const fmtTrend = (n: number) => (settings.trendFormat === 'percent' ? f.pct(n) : f.delta(n));
  const vs = t.kpi.vs[settings.comparePeriod];
  const cards: {
    key: 'total' | 'inStock' | 'categories' | 'lowStock';
    label: string;
    kpi: ProductKpi;
    caption: string;
    lowerIsBetter?: boolean;
  }[] = [
    { key: 'total', label: t.kpi.total, kpi: kpis.total, caption: vs },
    {
      key: 'inStock',
      label: t.kpi.inStock,
      kpi: kpis.inStock,
      caption:
        kpis.inStockShare === null
          ? vs
          : fill(t.kpi.shareOfStock, { pct: f.qty(String(kpis.inStockShare)) }),
    },
    { key: 'categories', label: t.kpi.categories, kpi: kpis.categories, caption: t.kpi.groups },
    { key: 'lowStock', label: t.kpi.lowStock, kpi: kpis.lowStock, caption: t.kpi.needsAttention, lowerIsBetter: true },
  ];

  return (
    <section className={styles.kpis} aria-label={t.kpisLabel}>
      {cards.map((c, i) => {
        const tr = c.kpi.trend;
        const good = tr !== null && (c.lowerIsBetter ? tr <= 0 : tr >= 0);
        const caption =
          c.key === 'total'
            ? [
                settings.showTrends && c.kpi.previous === null ? t.kpi.noTrend : c.caption,
                settings.includeServices ? null : t.kpi.stockItemsOnly,
              ]
                .filter(Boolean)
                .join(' · ')
            : c.caption;
        return (
          <article key={c.key} className={`${styles.kpi} ${styles[KPI_TONE[i]!]}`}>
            <div className={styles.kpiTop}>
              <div className={styles.kpiText}>
                <h2 className={styles.kpiLabel}>{c.label}</h2>
                <p className={styles.kpiValue}>
                  {f.whole(c.kpi.value)}
                  {settings.showTrends && tr !== null && (
                    <span className={good ? dash.trendUp : dash.trendDown}>{fmtTrend(tr)}</span>
                  )}
                </p>
              </div>
              {sparks && (
                <Sparkline
                  values={sparks[c.key]}
                  label={fill(t.kpi.chartLabel, { kpi: c.label, period: t.kpi.chartPeriod[settings.comparePeriod] })}
                  waiting={t.kpi.chartWaiting}
                />
              )}
            </div>
            <p className={styles.kpiCaption} title={caption}>
              {caption}
            </p>
          </article>
        );
      })}
    </section>
  );
}

const STATUS_CLASS: Record<StockStatus, string> = {
  inStock: 'statusIn',
  lowStock: 'statusLow',
  outOfStock: 'statusOut',
  service: 'statusService',
};

function ProductTable({
  rows,
  priceMode,
  t,
  f,
}: {
  rows: ProductListRow[];
  priceMode: 'withVat' | 'withoutVat';
  t: Dictionary['products'];
  f: Formatters;
}) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t.table.name}</th>
            <th scope="col">{t.table.category}</th>
            <th scope="col" className={dash.num}>
              {priceMode === 'withVat' ? t.table.priceWithVat : t.table.priceWithoutVat}
            </th>
            <th scope="col">{t.table.code}</th>
            <th scope="col">{t.table.status}</th>
            <th scope="col">
              <span className={dash.visuallyHidden}>{t.actions.column}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <span className={styles.name} title={r.nazev}>
                  {r.nazev}
                </span>
                {r.eanKod && <span className={styles.sub}>EAN {r.eanKod}</span>}
              </td>
              <td className={`${styles.nowrap} ${r.skupinaNazev ? '' : styles.muted}`}>
                {r.skupinaNazev ?? r.skupinaKod ?? t.table.noCategory}
              </td>
              <td className={dash.num}>{f.czk(r.price)}</td>
              <td>
                <span className={styles.code}>
                  {r.unit && <span className={styles.unit}>{r.unit}</span>}
                  {r.kod}
                </span>
              </td>
              <td>
                <span className={`${styles.status} ${styles[STATUS_CLASS[r.status]]}`}>
                  {t.status[r.status]}
                  {(r.status === 'inStock' || r.status === 'lowStock') && (
                    <span className={styles.qty}>{'\u00a0·\u00a0'}{f.qty(r.stock)}</span>
                  )}
                </span>
              </td>
              <td className={styles.actionsCell}>
                <RowActions id={r.id} name={r.nazev} code={r.kod} ean={r.eanKod} labels={t.actions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A successful sync younger than this shows "Live Sync". */
const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

interface SyncInfo {
  status: string;
  at: Date;
  fresh: boolean;
}

/** Latest sync run for the badge; null when there is none or the DB fails. */
async function loadSync(): Promise<SyncInfo | null> {
  const run = await getLastFlexiSync().catch(() => null);
  if (!run) return null;
  const at = run.finishedAt ?? run.startedAt;
  return { status: run.status, at, fresh: Date.now() - at.getTime() < LIVE_WINDOW_MS };
}

function SyncBadge({
  sync: run,
  t,
  f,
}: {
  sync: SyncInfo | null;
  t: Dictionary['products']['sync'];
  f: Formatters;
}) {
  if (!run) return <span className={`${styles.sync} ${styles.syncIdle}`}>{t.never}</span>;
  const { at, fresh } = run;
  const title = fill(t.lastRun, { at: f.dateTime(at) });
  if (run.status === 'running') {
    return (
      <span className={`${styles.sync} ${styles.syncLive}`} title={title}>
        {t.running}
      </span>
    );
  }
  if (run.status === 'failed') {
    return (
      <span className={`${styles.sync} ${styles.syncFailed}`} title={title}>
        {t.failed}
      </span>
    );
  }
  // Fresh within the window → "Live Sync"; older → when it last ran.
  return (
    <span className={`${styles.sync} ${fresh ? styles.syncLive : styles.syncIdle}`} title={title}>
      {fresh ? t.live : fill(t.stale, { at: f.dateTime(at) })}
    </span>
  );
}
