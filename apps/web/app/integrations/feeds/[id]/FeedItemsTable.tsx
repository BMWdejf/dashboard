'use client';

import { FEED_FLEXI_MAX_ITEMS, FEED_SYNC_FIELDS, flexiKodSchema, type FeedSyncField } from '@repo/core-sync/feed-flexi';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import type { Dictionary } from '../../../../lib/i18n';
import { fill } from '../../../../lib/i18n';
import styles from '../../integrations.module.css';
import { createInFlexi, updateInFlexi, type FeedFlexiActionResult, type FeedFlexiItemResult } from './actions';
import feed from './feed.module.css';

type T = Dictionary['feedDetail'];

export interface FeedTableRow {
  id: string;
  kod: string;
  nazev: string | null;
  /** Formatted on the server. */
  cena: string | null;
  kategorie: string | null;
  obrazek: string | null;
  suggestedKod: string;
  cenik: { id: string; kod: string; nazev: string } | null;
  changes: { field: FeedSyncField; flexi: string | null; feed: string }[];
}

type Status = 'new' | 'linked' | 'changed';
type Notice = { tone: 'ok' | 'warn' | 'error'; lines: string[] };

/**
 * The feed items of one tab. "Nové": pick items, adjust their Flexi codes,
 * check them in a dry run, then create them. "Se změnami": pick items and
 * fields, check, then write the changes. "Ve Flexi" only lists and links.
 */
export function FeedItemsTable({ feedId, status, rows, t }: { feedId: string; status: Status; rows: FeedTableRow[]; t: T }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kods, setKods] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.suggestedKod])));
  const [fields, setFields] = useState<Set<FeedSyncField>>(new Set(FEED_SYNC_FIELDS));
  const [results, setResults] = useState<Record<string, FeedFlexiItemResult & { real: boolean }>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, start] = useTransition();

  const editable = status !== 'linked';
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleField = (f: FeedSyncField) =>
    setFields((s) => {
      const next = new Set(s);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const chosen = rows.filter((r) => selected.has(r.id));
  const kodInvalid = (id: string) => !flexiKodSchema.safeParse(kods[id] ?? '').success;
  const tooMany = chosen.length > FEED_FLEXI_MAX_ITEMS;
  const blocked =
    pending ||
    chosen.length === 0 ||
    tooMany ||
    (status === 'new' && chosen.some((r) => kodInvalid(r.id))) ||
    (status === 'changed' && fields.size === 0);

  function show(r: FeedFlexiActionResult, check: boolean) {
    if (!r.ok) {
      setNotice({ tone: 'error', lines: [t.errors[r.error], ...r.messages] });
      return;
    }
    const real = !r.dryRun;
    setResults((prev) => ({ ...prev, ...Object.fromEntries(r.items.map((i) => [i.id, { ...i, real }])) }));
    const counts = { ok: r.okCount, failed: r.failed };
    const line = check
      ? fill(t.summary.checked, counts)
      : r.dryRun
        ? fill(t.summary.dryRun, counts)
        : fill(status === 'new' ? t.summary.created : t.summary.updated, counts);
    setNotice({
      tone: r.failed > 0 || r.syncFailed ? 'warn' : real ? 'ok' : check ? 'ok' : 'warn',
      lines: r.syncFailed ? [line, t.summary.syncFailed] : [line],
    });
    // Created/updated items leave this tab once the page is revalidated.
    if (real) setSelected(new Set());
  }

  function run(check: boolean) {
    if (!check && !window.confirm(fill(status === 'new' ? t.confirmCreate : t.confirmUpdate, { n: chosen.length }))) return;
    setNotice(null);
    start(async () => {
      const r =
        status === 'new'
          ? await createInFlexi(feedId, { check, items: chosen.map((c) => ({ id: c.id, kod: (kods[c.id] ?? '').trim() })) })
          : await updateInFlexi(feedId, { check, items: chosen.map((c) => c.id), fields: [...fields] });
      show(r, check);
    });
  }

  return (
    <>
      {editable && (
        <div className={feed.toolbar}>
          <p className={feed.count} aria-live="polite">
            {fill(t.selected, { n: chosen.length })}
            {tooMany && <span className={feed.bad}> · {fill(t.max, { n: FEED_FLEXI_MAX_ITEMS })}</span>}
          </p>
          {status === 'changed' && (
            <fieldset className={feed.fields}>
              <legend>{t.fields}</legend>
              {FEED_SYNC_FIELDS.map((f) => (
                <label key={f} className={feed.field}>
                  <input type="checkbox" checked={fields.has(f)} onChange={() => toggleField(f)} />
                  {t.field[f]}
                </label>
              ))}
            </fieldset>
          )}
          <div className={feed.actions}>
            <button type="button" className={styles.secondary} disabled={blocked} onClick={() => run(true)}>
              {pending ? t.working : t.check}
            </button>
            <button type="button" className={styles.primary} disabled={blocked} onClick={() => run(false)}>
              {status === 'new' ? t.create : t.update}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className={`${feed.notice} ${feed[`notice_${notice.tone}`]}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={`${styles.table} ${feed.table}`}>
          <thead>
            <tr>
              {editable && (
                <th scope="col" className={feed.check}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={t.col.selectAll} />
                </th>
              )}
              <th scope="col">{t.col.item}</th>
              <th scope="col" className={styles.num}>
                {t.col.price}
              </th>
              {status === 'new' ? (
                <>
                  <th scope="col">{t.col.category}</th>
                  <th scope="col">{t.col.flexiKod}</th>
                </>
              ) : (
                <th scope="col">{t.col.product}</th>
              )}
              {status === 'changed' && <th scope="col">{t.col.changes}</th>}
              {editable && <th scope="col">{t.col.result}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const res = results[r.id];
              const bad = status === 'new' && kodInvalid(r.id);
              return (
                <tr key={r.id} className={selected.has(r.id) ? feed.selectedRow : undefined}>
                  {editable && (
                    <td className={feed.check}>
                      <input
                        type="checkbox"
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                        aria-label={`${t.col.select}: ${r.nazev ?? r.kod}`}
                      />
                    </td>
                  )}
                  <td>
                    <div className={feed.item}>
                      {r.obrazek ? (
                        // Supplier images come from any host, so no next/image optimisation.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.obrazek} alt="" className={feed.thumb} loading="lazy" referrerPolicy="no-referrer" />
                      ) : (
                        <span className={feed.thumb} aria-hidden />
                      )}
                      <span className={styles.stack}>
                        <span className={styles.name}>{r.nazev ?? '—'}</span>
                        <span className={`${styles.sub} ${styles.mono}`}>{r.kod}</span>
                      </span>
                    </div>
                  </td>
                  <td className={styles.num}>{r.cena ?? <span className={styles.muted}>—</span>}</td>
                  {status === 'new' ? (
                    <>
                      <td className={feed.category}>{r.kategorie ?? <span className={styles.muted}>—</span>}</td>
                      <td>
                        <input
                          className={`${feed.kod} ${bad ? feed.kodBad : ''}`}
                          value={kods[r.id] ?? ''}
                          maxLength={64}
                          spellCheck={false}
                          aria-label={`${t.col.flexiKod}: ${r.nazev ?? r.kod}`}
                          aria-invalid={bad || undefined}
                          title={t.kodHint}
                          onChange={(e) => setKods((k) => ({ ...k, [r.id]: e.target.value.toUpperCase() }))}
                        />
                      </td>
                    </>
                  ) : (
                    <td>
                      {r.cenik && (
                        <Link href={`/products/${r.cenik.id}`} className={feed.product} title={t.openProduct}>
                          <span className={styles.mono}>{r.cenik.kod}</span>
                        </Link>
                      )}
                    </td>
                  )}
                  {status === 'changed' && (
                    <td>
                      <ul className={feed.changes}>
                        {r.changes.map((c) => (
                          <li key={c.field} className={fields.has(c.field) ? undefined : feed.off}>
                            <strong>{t.field[c.field]}:</strong> <del>{c.flexi ?? t.empty_value}</del> → <ins>{c.feed}</ins>
                          </li>
                        ))}
                      </ul>
                    </td>
                  )}
                  {editable && (
                    <td className={feed.result}>
                      {res && <Result res={res} status={status} t={t} />}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Result({ res, status, t }: { res: FeedFlexiItemResult & { real: boolean }; status: Status; t: T }) {
  if (res.ok) {
    const label = !res.real ? t.resultOk : status === 'new' ? t.resultCreated : t.resultUpdated;
    return <span className={`${styles.status} ${styles.statusOk}`}>{label}</span>;
  }
  const lines = [
    ...res.problems.map((p) => (t.problems as Record<string, string>)[p] ?? p),
    ...res.messages,
  ];
  return (
    <ul className={feed.errors}>
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
