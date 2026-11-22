import {
  getProductDetail,
  getRecentFlexiSyncRuns,
  getShoptetSettings,
  listProductGroups,
  DEFAULT_SHOPTET_SETTINGS,
  stockStatus,
  type Locale,
  type ProductDetail,
} from '@repo/core-db';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatters, relative, type Formatters } from '../../dashboard/format';
import { fill, intlLocale, type Dictionary } from '../../../lib/i18n';
import { getI18n } from '../../../lib/locale';
import products from '../products.module.css';
import d from './detail.module.css';
import {
  ExportToggle,
  HeaderActions,
  MappingHeadActions,
  MappingTable,
  ProductEditor,
  PublishedLine,
  StatusBar,
  StockRules,
  type EditorData,
} from './Editor';
import { SyncLog, type SyncLogRow } from './SyncLog';

// Reads the Flexi mirror on every request (frame and session: ../layout.tsx).
export const dynamic = 'force-dynamic';

type T = Dictionary['products']['detail'];
type Num = { toString(): string } | null;

const num = (v: Num) => (v === null ? null : Number(v.toString()));

/** A successful sync younger than this counts as "active". */
const LIVE_WINDOW_MS = 2 * 60 * 60 * 1000;

interface SyncInfo {
  /** Latest run, with its time as "5 min ago". */
  last: {
    status: string;
    at: Date;
    ago: string;
    time: string;
    live: boolean;
  } | null;
  rows: SyncLogRow[];
}

const IMAGE_FILE = /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i;

/**
 * The product's picture: its main Flexi attachment (else the first image),
 * from our stored copy or the attachment's link. Only https URLs.
 */
function mainImage(prilohy: ProductDetail['prilohy']): string | null {
  const src = (a: ProductDetail['prilohy'][number]) => a.url ?? a.odkaz;
  const isImage = (a: ProductDetail['prilohy'][number]) =>
    !!src(a) &&
    (a.contentType?.startsWith('image/') || IMAGE_FILE.test(src(a) ?? ''));
  const a =
    prilohy.find((x) => x.hlavni && isImage(x)) ?? prilohy.find(isImage);
  const url = a ? src(a) : null;
  return url && url.startsWith('https://') ? url : null;
}

/** Sync runs for the header badge and the log card (time maths outside render). */
async function loadSync(
  locale: Locale,
  t: T,
  f: Formatters,
): Promise<SyncInfo> {
  const runs = await getRecentFlexiSyncRuns(6).catch(() => []);
  const now = Date.now();
  const time = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  });
  const first = runs[0];
  return {
    last: first
      ? (() => {
          const at = first.finishedAt ?? first.startedAt;
          return {
            status: first.status,
            at,
            ago: relative(at, now, locale),
            // Design: "14:30:05 (4m ago)".
            time: new Intl.DateTimeFormat(intlLocale(locale), {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZone: 'Europe/Prague',
            }).format(at),
            live:
              first.status === 'success' && now - at.getTime() < LIVE_WINDOW_MS,
          };
        })()
      : null,
    rows: runs.map((r) => {
      const counts = (r.counts ?? {}) as {
        evidences?: Record<string, { written?: number; fetched?: number }>;
      };
      const ev = counts.evidences ?? {};
      const status = (
        r.status === 'success' || r.status === 'failed' ? r.status : 'running'
      ) as SyncLogRow['status'];
      return {
        id: r.id,
        time: time.format(r.startedAt),
        status,
        statusLabel:
          status === 'success'
            ? t.statusOk
            : status === 'failed'
              ? t.statusFailed
              : t.statusRunning,
        trigger: (t.triggers as Record<string, string>)[r.trigger] ?? r.trigger,
        text:
          r.status === 'failed' && r.error
            ? r.error
            : fill(t.runSummary, {
                cenik: f.whole(ev.cenik?.written ?? 0),
                karty: f.whole(ev['skladova-karta']?.written ?? 0),
              }),
      };
    }),
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { locale, t } = await getI18n();
  const f = formatters(locale);
  const td = t.products.detail;

  let product: ProductDetail | null;
  try {
    product = await getProductDetail(id);
  } catch (e) {
    console.error(
      'products/[id]: loading failed',
      e instanceof Error ? e.message : e,
    );
    return (
      <>
        <TopBar t={td} />
        <div className={d.page}>
          <p className={d.message} role="alert">
            {td.loadError}
          </p>
        </div>
      </>
    );
  }
  if (!product || product.deletedAt) notFound();
  const p = product;
  const [sync, shoptet, groups] = await Promise.all([
    loadSync(locale, td, f),
    getShoptetSettings(p.id).catch(() => DEFAULT_SHOPTET_SETTINGS),
    listProductGroups().catch(() => []),
  ]);

  const unit = p.mj1?.kod ?? '';
  const qty = (v: Num) =>
    `${f.qty(v?.toString() ?? '0')}${unit ? ` ${unit}` : ''}`;
  const minStock = p.skladoveKarty.reduce((a, k) => a + Number(k.minMj), 0);
  const status = stockStatus({
    skladove: p.skladove,
    stock: Number(p.sumStavMj),
    minStock,
    settings: { lowStockMode: 'flexiMin', lowStockThreshold: 5 },
  });
  const image = mainImage(p.prilohy);
  const supplier = p.dodavatele.find((s) => s.primarni) ?? p.dodavatele[0];
  const group = p.skupinaZbozi
    ? (p.skupinaZbozi.nazev ?? p.skupinaZbozi.kod)
    : null;

  // Pricing & margin (design card 1), from Flexi prices.
  const purchase = num(p.nakupCena);
  const net = num(p.cenaZaklBezDph);
  const gross = num(p.cenaZaklVcDph);
  const vatRate = num(p.szbDph);
  const vat = net !== null && gross !== null ? gross - net : null;
  const profit = purchase && net !== null ? net - purchase : null;
  const margin = profit !== null && net ? (profit / net) * 100 : null;

  const syncBadge = !sync.last
    ? { cls: d.badgeIdle, text: td.notSynced.toUpperCase() }
    : sync.last.status === 'failed'
      ? { cls: d.badgeDanger, text: td.syncFailed.toUpperCase() }
      : sync.last.live
        ? {
            cls: d.badgeLive,
            text: fill(td.liveSync, { ago: sync.last.ago }).toUpperCase(),
          }
        : {
            cls: d.badgeIdle,
            text: fill(td.staleSync, { ago: sync.last.ago }).toUpperCase(),
          };

  // Plain decimal strings for the inputs ("789.000000" → "789").
  const plain = (v: Num) => (v === null ? '' : String(Number(v.toString())));
  const editor: EditorData = {
    cenikId: p.id,
    kod: p.kod,
    locale,
    flexi: {
      nazev: p.nazev,
      nakupCena: plain(p.nakupCena),
      cenaZakl: plain(p.cenaZakl),
      typSazbyDph: p.typSazbyDph ?? 'dphZakl',
      skupinaKod: p.skupinaZbozi?.kod ?? '',
      exportNaEshop: p.exportNaEshop,
    },
    typCenyDph: p.typCenyDph === 'sDph' ? 'sDph' : 'bezDph',
    szbDph: vatRate,
    priceNet: net === null ? null : String(net),
    priceGross: gross === null ? null : String(gross),
    stock: p.sumStavMj.toString(),
    available: p.sumDostupMj.toString(),
    unit,
    skladove: p.skladove,
    groups,
    shoptet,
  };

  return (
    <>
      <TopBar t={td} />
      <ProductEditor data={editor} t={td}>
        <div className={d.page}>
          {/* Page header & action bar */}
          <header className={d.header}>
            <div className={d.headerText}>
              <h1 className={d.title}>{p.nazev}</h1>
              <p className={d.badges}>
                {p.eanKod && (
                  <span className={d.badgeNeutral}>EAN: {p.eanKod}</span>
                )}
                <span className={d.badgeAccent}>
                  {td.code.toUpperCase()}: {p.kod}
                </span>
                <span className={`${d.badgeStatus} ${syncBadge.cls}`}>
                  {syncBadge.text}
                </span>
              </p>
            </div>
            <HeaderActions />
          </header>
          <StatusBar />

          {/* 1. Product & channel header card */}
          <section
            className={`${d.card} ${d.snapshotCard}`}
            aria-labelledby="snapshot"
          >
            <span className={d.glow} aria-hidden />
            <div className={d.snapshot}>
              <div className={d.thumb} aria-hidden>
                {image ? (
                  // Flexi links to images on other hosts (Shoptet CDN…); next/image would
                  // need every host allow-listed.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={d.thumbImg}
                    src={image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className={d.thumbCode}>{p.kod}</span>
                )}
              </div>
              <div className={d.snapshotText}>
                <h2 id="snapshot" className={d.snapshotName}>
                  {p.nazev}
                </h2>
                <p className={d.snapshotMeta}>
                  <span>
                    {td.supplier}:{' '}
                    {supplier?.firma?.nazev ??
                      supplier?.firma?.kod ??
                      td.noSupplier}
                  </span>
                  <span aria-hidden>•</span>
                  <span>
                    {td.group}: <strong>{group ?? td.noGroup}</strong>
                  </span>
                  <span aria-hidden>•</span>
                  <span>
                    {td.flow}: {td.flowValue}
                  </span>
                </p>
              </div>
            </div>

            <div className={d.connectors} aria-label={td.connectors}>
              <Connector
                title={td.feedTitle}
                badge={{ text: td.notConnected, tone: 'idle' }}
                rows={[
                  [td.lastFetch, '—'],
                  [td.volume, '—'],
                ]}
              />
              <Connector
                title={td.flexiTitle}
                badge={{ text: td.restApi, tone: 'accent' }}
                rows={[
                  [
                    td.lastSync,
                    sync.last ? `${sync.last.time} (${sync.last.ago})` : '—',
                  ],
                  [td.direction, td.directionValue],
                ]}
                active
              />
              <Connector
                title={td.shoptetTitle}
                badge={{ text: td.notConnected, tone: 'idle' }}
                rows={[
                  [td.lastPush, '—'],
                  [td.eshopExport, <ExportToggle key="export" />],
                ]}
              />
            </div>
          </section>

          {/* 2. Field mapping & data flow table */}
          <section
            className={`${d.card} ${d.mappingCard}`}
            aria-labelledby="mapping"
          >
            <div className={d.mappingHead}>
              <div className={d.mappingTitle}>
                <h2 id="mapping">{td.mappingTitle}</h2>
                <span className={d.badgeNeutral}>
                  {fill(td.attributesCount, { n: 7 })}
                </span>
              </div>
              <MappingHeadActions />
            </div>
            <MappingTable />
          </section>

          {/* 3. Bottom command deck */}
          <div className={d.deck}>
            <section className={d.card} aria-labelledby="pricing">
              <CardHead
                id="pricing"
                title={td.pricingTitle}
                subtitle={td.pricingSubtitle}
              />
              <dl className={d.lines}>
                <Line
                  label={td.purchasePrice}
                  value={f.czk(purchase === null ? null : String(purchase))}
                />
                <Line
                  label={td.priceNet}
                  value={f.czk(net === null ? null : String(net))}
                />
                <Line
                  label={td.priceGross}
                  value={f.czk(gross === null ? null : String(gross))}
                  strong
                />
                <Line
                  label={fill(td.vatAmount, {
                    rate: vatRate === null ? '—' : f.share(vatRate),
                  })}
                  value={f.czk(vat === null ? null : vat.toFixed(2))}
                />
              </dl>
              {margin !== null && profit !== null ? (
                <div className={d.marginBox}>
                  <div>
                    <span className={d.marginLabel}>{td.grossMargin}</span>
                    <span
                      className={profit >= 0 ? d.marginValue : d.marginValueNeg}
                    >
                      {f.pct(Math.round(margin * 10) / 10)}
                    </span>
                  </div>
                  <div>
                    <span className={d.marginLabel}>{td.unitProfit}</span>
                    <span
                      className={profit >= 0 ? d.marginValue : d.marginValueNeg}
                    >
                      {profit > 0 ? '+' : ''}
                      {f.czk(profit.toFixed(2))}
                    </span>
                  </div>
                </div>
              ) : (
                <p className={d.note}>{td.noPurchase}</p>
              )}
            </section>

            <section className={d.card} aria-labelledby="stock">
              <CardHead
                id="stock"
                title={td.stockTitle}
                subtitle={td.stockSubtitle}
                badge={
                  <span
                    className={`${products.status} ${products[STATUS_CLASS[status]]}`}
                    title={`${td.minimum} ${minStock > 0 ? qty(String(minStock)) : '—'}`}
                  >
                    {t.products.status[status].toUpperCase()}
                  </span>
                }
              />
              {p.skladove ? (
                <dl className={d.lines}>
                  {p.skladoveKarty.length === 0 && (
                    <p className={d.note}>{td.noCards}</p>
                  )}
                  {p.skladoveKarty.slice(0, 3).map((k) => (
                    <Line
                      key={k.id}
                      label={k.sklad.nazev ?? k.sklad.kod}
                      value={qty(k.stavMj)}
                    />
                  ))}
                  <Line label={td.reserved} value={`−${qty(p.sumRezerMj)}`} />
                  <Line
                    label={td.available}
                    value={qty(p.sumDostupMj)}
                    strong
                  />
                  <PublishedLine />
                </dl>
              ) : (
                <p className={d.note}>{td.notStocked}</p>
              )}
              <StockRules />
            </section>

            <section className={d.card} aria-labelledby="log">
              <CardHead
                id="log"
                title={td.logTitle}
                subtitle={td.logSubtitle}
                badge={
                  <span className={d.badgeLiveSmall}>
                    {td.logBadge.toUpperCase()}
                  </span>
                }
              />
              <SyncLog
                rows={sync.rows.slice(0, 4)}
                labels={{
                  all: td.filterAll,
                  ok: td.filterOk,
                  failed: td.filterFailed,
                  filter: td.filterLabel,
                  empty: td.noRuns,
                }}
              />
              <p className={d.logFooter}>
                <span
                  className={
                    sync.last?.status === 'failed' ? d.dotDanger : d.dotLive
                  }
                  aria-hidden
                />
                {sync.last
                  ? fill(td.logFooter, { ago: sync.last.ago })
                  : td.logFooterNone}
              </p>
            </section>
          </div>

          <p className={d.source}>
            {fill(td.source, {
              id: p.flexiId,
              changed: f.dateTime(p.lastUpdate),
              synced: f.dateTime(p.syncedAt),
            })}
          </p>
        </div>
      </ProductEditor>
    </>
  );
}

const STATUS_CLASS = {
  inStock: 'statusIn',
  lowStock: 'statusLow',
  outOfStock: 'statusOut',
  service: 'statusService',
} as const;

/** Design: "Top Admin Header" with the breadcrumb (64px, translucent, blurred). */
function TopBar({ t }: { t: T }) {
  return (
    <div className={d.topBar}>
      <nav aria-label={t.breadcrumbLabel} className={d.crumbs}>
        <Link href="/">
          <span className={d.iconHome} aria-hidden />
          {t.breadcrumbHome}
        </Link>
        <span className={d.crumbSep} aria-hidden />
        <Link href="/products">{t.breadcrumbProducts}</Link>
        <span className={d.crumbSep} aria-hidden />
        <span aria-current="page">{t.breadcrumbCurrent}</span>
      </nav>
    </div>
  );
}

function Connector({
  title,
  badge,
  rows,
  active,
}: {
  title: string;
  badge: { text: string; tone: 'idle' | 'accent' };
  rows: [string, React.ReactNode][];
  active?: boolean;
}) {
  return (
    <div className={`${d.connector} ${active ? d.connectorActive : ''}`}>
      <div className={d.connectorHead}>
        <span className={d.connectorTitle}>
          <span className={active ? d.dotLive : d.dotIdle} aria-hidden />
          {title}
        </span>
        <span className={badge.tone === 'accent' ? d.pillAccent : d.pillIdle}>
          {badge.text}
        </span>
      </div>
      <dl className={d.connectorRows}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CardHead({
  id,
  title,
  subtitle,
  badge,
}: {
  id: string;
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className={d.cardHead}>
      <div className={d.cardHeadRow}>
        <h3 id={id}>{title}</h3>
        {badge}
      </div>
      <p>{subtitle}</p>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className={d.line}>
      <dt>{label}</dt>
      <dd className={strong ? d.lineStrong : undefined}>{value}</dd>
    </div>
  );
}
