import { getSupplierFeedOverview, listSupplierFeedItems, type FeedItemStatus, type Locale } from '@repo/core-db';
import { suggestFlexiKod } from '@repo/core-sync/feed-flexi';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatters, relative, type Formatters } from '../../../dashboard/format';
import { fill } from '../../../../lib/i18n';
import { getI18n } from '../../../../lib/locale';
import styles from '../../integrations.module.css';
import feed from './feed.module.css';
import { FeedItemsTable, type FeedTableRow } from './FeedItemsTable';

// Reads the feed items and the Flexi mirror on every request (session: layout.tsx).
export const dynamic = 'force-dynamic';

const PER_PAGE = 50;
const STATUSES: FeedItemStatus[] = ['new', 'linked', 'changed'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VAT: Record<string, string> = { dphZakl: '21 %', dphSniz: '12 %', dphSniz2: '10 %', dphOsv: '0 %' };

/** A changed value as the table shows it: prices in CZK, VAT as a percent, texts shortened. */
function shown(field: string, v: string | null, f: Formatters): string | null {
  if (v === null || v === '') return null;
  if (field === 'cena') return f.czk(v);
  if (field === 'sazbaDph') return VAT[v] ?? v;
  if (field === 'dodaciLhuta' || field === 'hmotnost') return f.qty(v);
  const plain = v.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > 120 ? `${plain.slice(0, 117)}…` : plain;
}

/** "před 5 min", outside render (reads the clock). */
function ago(at: Date | null, locale: Locale): string | null {
  return at ? relative(at, Date.now(), locale) : null;
}

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function href(id: string, status: FeedItemStatus, q: string, page = 1) {
  const p = new URLSearchParams();
  if (status !== 'new') p.set('status', status);
  if (q) p.set('q', q);
  if (page > 1) p.set('page', String(page));
  const s = p.toString();
  return `/integrations/feeds/${id}${s ? `?${s}` : ''}`;
}

export default async function FeedItemsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { locale, t } = await getI18n();
  const td = t.feedDetail;
  const f = formatters(locale);
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === one(sp.status)) ?? 'new';
  const q = (one(sp.q) ?? '').trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(one(sp.page) ?? 1)) || 1);

  const overview = await getSupplierFeedOverview(id).catch((e) => {
    console.error('feed items: overview failed', e instanceof Error ? e.message : e);
    return undefined;
  });
  if (overview === null) notFound();
  const list = overview
    ? await listSupplierFeedItems(id, { status, q, page, perPage: PER_PAGE }).catch((e) => {
        console.error('feed items: list failed', e instanceof Error ? e.message : e);
        return null;
      })
    : null;

  const lastImportAgo = ago(overview?.lastImportAt ?? null, locale);

  // Only what the table shows goes to the browser (no descriptions or raw tags).
  const rows: FeedTableRow[] = (list?.rows ?? []).map((r) => ({
    id: r.id,
    kod: r.kod,
    nazev: r.nazev,
    cena: r.cenaBezna === null ? null : f.czk(r.cenaBezna),
    kategorie: r.kategorie,
    obrazek: r.obrazek,
    suggestedKod: suggestFlexiKod(r.nazev, r.kod),
    cenik: r.cenik ? { id: r.cenik.id, kod: r.cenik.kod, nazev: r.cenik.nazev } : null,
    changes: r.changes.map((c) => ({
      field: c.field,
      flexi: shown(c.field, c.flexi, f),
      feed: shown(c.field, c.feed, f) ?? '',
    })),
  }));

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.titleBlock}>
          <Link href="/integrations" className={feed.back}>
            ← {td.back}
          </Link>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{overview ? fill(td.title, { name: overview.name }) : td.back}</h1>
          </div>
          <p className={styles.subtitle}>
            {td.subtitle}
            {lastImportAgo && <> {fill(td.lastImport, { ago: lastImportAgo })}</>}
          </p>
        </div>
      </header>

      {!overview ? (
        <p className={`${styles.tableCard} ${styles.message}`} role="alert">
          {td.loadError}
        </p>
      ) : (
        <section className={styles.tableCard} aria-labelledby="feed-items-title">
          <div className={styles.tableHead}>
            <div className={styles.filters}>
              <h2 id="feed-items-title" className={feed.visuallyHidden}>
                {td.tabs.label}
              </h2>
              <nav className={styles.pills} aria-label={td.tabs.label}>
                {STATUSES.map((s) => (
                  <Link
                    key={s}
                    href={href(id, s, q)}
                    className={styles.filterPill}
                    aria-current={s === status ? 'page' : undefined}
                    scroll={false}
                  >
                    {fill(td.tabs[s], { n: f.whole(overview.counts[s]) })}
                  </Link>
                ))}
              </nav>
            </div>
            <form className={feed.search} role="search" action={`/integrations/feeds/${id}`}>
              {status !== 'new' && <input type="hidden" name="status" value={status} />}
              <label htmlFor="feed-q" className={feed.visuallyHidden}>
                {td.searchLabel}
              </label>
              <input id="feed-q" name="q" type="search" defaultValue={q} placeholder={td.searchPlaceholder} className={feed.searchInput} />
              <button type="submit" className={styles.secondary}>
                {td.search}
              </button>
            </form>
          </div>

          {!list ? (
            <p className={styles.message} role="alert">
              {td.loadError}
            </p>
          ) : list.total === 0 ? (
            <p className={styles.message}>{q ? td.empty.search : td.empty[status]}</p>
          ) : (
            <FeedItemsTable key={`${status}-${q}-${page}`} feedId={id} status={status} rows={rows} t={td} />
          )}

          {list && list.total > 0 && (
            <footer className={styles.tableFoot}>
              <p>
                {fill(td.range, {
                  from: f.whole((page - 1) * PER_PAGE + 1),
                  to: f.whole(Math.min(page * PER_PAGE, list.total)),
                  total: f.whole(list.total),
                })}
              </p>
              <nav className={feed.pager} aria-label={td.pagination}>
                {page > 1 ? (
                  <Link href={href(id, status, q, page - 1)} className={styles.secondary}>
                    {td.prev}
                  </Link>
                ) : (
                  <span className={styles.secondary} aria-disabled="true">
                    {td.prev}
                  </span>
                )}
                {page * PER_PAGE < list.total ? (
                  <Link href={href(id, status, q, page + 1)} className={styles.secondary}>
                    {td.next}
                  </Link>
                ) : (
                  <span className={styles.secondary} aria-disabled="true">
                    {td.next}
                  </span>
                )}
              </nav>
            </footer>
          )}
        </section>
      )}
    </div>
  );
}
