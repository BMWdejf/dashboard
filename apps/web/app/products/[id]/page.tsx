import { getProductDetail, type ProductDetail } from '@repo/core-db';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { formatters, type Formatters } from '../../dashboard/format';
import { fill, type Dictionary } from '../../../lib/i18n';
import { getI18n } from '../../../lib/locale';
import styles from '../products.module.css';
import d from './detail.module.css';

// Reads the Flexi mirror on every request (frame and session: ../layout.tsx).
export const dynamic = 'force-dynamic';

type T = Dictionary['products']['detail'];

const dec = (v: { toString(): string } | null) => (v === null ? null : v.toString());

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale, t } = await getI18n();
  const f = formatters(locale);
  const td = t.products.detail;

  let product: ProductDetail | null;
  try {
    product = await getProductDetail(id);
  } catch (e) {
    console.error('products/[id]: loading failed', e instanceof Error ? e.message : e);
    return (
      <div className={styles.body}>
        <BackLink t={td} />
        <p className={styles.message} role="alert">
          {td.loadError}
        </p>
      </div>
    );
  }
  if (!product || product.deletedAt) notFound();
  const p = product;
  const unit = p.mj1?.kod ?? '';
  const qty = (v: { toString(): string }) => `${f.qty(v.toString())}${unit ? ` ${unit}` : ''}`;

  return (
    <>
      <header className={d.header}>
        <BackLink t={td} />
        <h1 className={styles.pageTitle}>{p.nazev}</h1>
        <p className={d.meta}>
          <span className={styles.code}>{p.kod}</span>
          {p.eanKod && <span>EAN {p.eanKod}</span>}
          {p.skupinaZbozi && <span>{p.skupinaZbozi.nazev ?? p.skupinaZbozi.kod}</span>}
        </p>
      </header>

      <div className={`${styles.body} ${d.grid}`}>
        <section className={d.card} aria-labelledby="prices">
          <h2 id="prices">{td.prices}</h2>
          <dl className={d.list}>
            <Row label={td.priceWithVat} value={f.czk(dec(p.cenaZaklVcDph))} strong />
            <Row label={td.priceWithoutVat} value={f.czk(dec(p.cenaZaklBezDph))} />
            <Row label={td.vatRate} value={p.szbDph === null ? '—' : f.share(Number(p.szbDph))} />
            <Row label={td.purchasePrice} value={f.czk(dec(p.nakupCena))} />
            {p.cenaBezna !== null && Number(p.cenaBezna) > 0 && (
              <Row label={td.usualPrice} value={f.czk(dec(p.cenaBezna))} />
            )}
          </dl>
        </section>

        <section className={d.card} aria-labelledby="stock">
          <h2 id="stock">{td.stock}</h2>
          {p.skladove ? (
            <>
              <dl className={d.list}>
                <Row label={td.stockTotal} value={qty(p.sumStavMj)} strong />
                <Row label={td.stockAvailable} value={qty(p.sumDostupMj)} />
                <Row label={td.stockReserved} value={qty(p.sumRezerMj)} />
              </dl>
              {p.skladoveKarty.length ? (
                <table className={d.table}>
                  <thead>
                    <tr>
                      <th scope="col">{td.warehouse}</th>
                      <th scope="col" className={d.num}>
                        {td.quantity}
                      </th>
                      <th scope="col" className={d.num}>
                        {td.minimum}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.skladoveKarty.map((k) => (
                      <tr key={k.id}>
                        <td>{k.sklad.nazev ?? k.sklad.kod}</td>
                        <td className={d.num}>{f.qty(k.stavMj.toString())}</td>
                        <td className={d.num}>{Number(k.minMj) > 0 ? f.qty(k.minMj.toString()) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={d.muted}>{td.noCards}</p>
              )}
            </>
          ) : (
            <p className={d.muted}>{t.products.status.service}</p>
          )}
        </section>

        <section className={d.card} aria-labelledby="class">
          <h2 id="class">{td.classification}</h2>
          <dl className={d.list}>
            <Row label={td.group} value={p.skupinaZbozi ? (p.skupinaZbozi.nazev ?? p.skupinaZbozi.kod) : '—'} />
            <Row label={td.stockType} value={(td.stockTypes as Record<string, string>)[p.typZasoby] ?? p.typZasoby} />
            <Row label={td.unit} value={p.mj1 ? `${p.mj1.kod}${p.mj1.nazev ? ` (${p.mj1.nazev})` : ''}` : '—'} />
            <Row label={td.eshop} value={p.exportNaEshop ? td.yes : td.no} />
            <Row
              label={td.warranty}
              value={
                p.zaruka
                  ? `${p.zaruka} ${(td.warrantyUnits as Record<string, string>)[p.mjZaruky ?? ''] ?? ''}`.trim()
                  : '—'
              }
            />
            <Row label={td.deliveryTime} value={p.dodaciLhuta === null ? '—' : f.qty(p.dodaciLhuta.toString())} />
            <Row
              label={td.weight}
              value={
                p.hmotnostNetto && Number(p.hmotnostNetto) > 0
                  ? `${f.qty(p.hmotnostNetto.toString())} ${p.mjHmotnosti?.kod ?? ''}`.trim()
                  : '—'
              }
            />
          </dl>
          {p.stitky.length > 0 && (
            <p className={d.tags} aria-label={td.labels}>
              {p.stitky.map((s) => (
                <span key={s} className={d.tag}>
                  {s}
                </span>
              ))}
            </p>
          )}
        </section>

        {(p.kratkyPopis || p.popis) && (
          <section className={`${d.card} ${d.wide}`} aria-labelledby="desc">
            <h2 id="desc">{td.description}</h2>
            {p.kratkyPopis && <p className={d.text}>{p.kratkyPopis}</p>}
            {p.popis && <p className={d.text}>{p.popis}</p>}
          </section>
        )}

        {p.atributy.length > 0 && (
          <section className={d.card} aria-labelledby="attrs">
            <h2 id="attrs">{td.attributes}</h2>
            <dl className={d.list}>
              {p.atributy.map((a) => (
                <Row key={a.id} label={a.typAtributu.nazev ?? a.typAtributu.kod} value={a.hodnota ?? '—'} />
              ))}
            </dl>
          </section>
        )}

        {p.odberatele.length > 0 && (
          <PriceTable
            id="customer-prices"
            title={td.customerPrices}
            t={td}
            f={f}
            rows={p.odberatele.map((o) => ({
              id: o.id,
              company: o.firma?.nazev ?? o.firma?.kod ?? '—',
              currency: o.mena,
              price: dec(o.prodejCena),
            }))}
          />
        )}

        {p.dodavatele.length > 0 && (
          <PriceTable
            id="supplier-prices"
            title={td.supplierPrices}
            t={td}
            f={f}
            rows={p.dodavatele.map((o) => ({
              id: o.id,
              company: `${o.firma?.nazev ?? o.firma?.kod ?? '—'}${o.primarni ? ` (${td.primary})` : ''}`,
              currency: o.mena,
              price: dec(o.nakupCena),
            }))}
          />
        )}

        {p.prilohy.length > 0 && (
          <section className={d.card} aria-labelledby="files">
            <h2 id="files">{td.attachments}</h2>
            <ul className={d.files}>
              {p.prilohy.map((a) => (
                <li key={a.id}>
                  <span>{a.nazevSouboru ?? a.odkaz ?? '—'}</span>
                  <span className={d.muted}>
                    {a.hlavni ? `${td.mainAttachment} · ` : ''}
                    {a.dataSize ? `${f.qty(String(Math.round(a.dataSize / 1024)))} kB` : (a.contentType ?? '')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className={`${d.source} ${d.wide}`}>
          {fill(td.source, {
            id: p.flexiId,
            changed: f.dateTime(p.lastUpdate),
            synced: f.dateTime(p.syncedAt),
          })}
        </p>
      </div>
    </>
  );
}

function BackLink({ t }: { t: T }) {
  return (
    <Link href="/products" className={d.back}>
      <span className={styles.chevronLeft} aria-hidden />
      {t.back}
    </Link>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={d.row}>
      <dt>{label}</dt>
      <dd className={strong ? d.strong : undefined}>{value}</dd>
    </div>
  );
}

function PriceTable({
  id,
  title,
  rows,
  t,
  f,
}: {
  id: string;
  title: string;
  rows: { id: string; company: string; currency: string | null; price: string | null }[];
  t: T;
  f: Formatters;
}) {
  return (
    <section className={d.card} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <table className={d.table}>
        <thead>
          <tr>
            <th scope="col">{t.company}</th>
            <th scope="col">{t.currency}</th>
            <th scope="col" className={d.num}>
              {t.price}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.company}</td>
              <td>{r.currency ?? 'CZK'}</td>
              <td className={d.num}>
                {r.price === null ? '—' : !r.currency || r.currency === 'CZK' ? f.czk(r.price) : `${f.qty(r.price)} ${r.currency}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
