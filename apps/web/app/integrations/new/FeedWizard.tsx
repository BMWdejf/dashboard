'use client';

import type { FeedCheckInfo, FeedPreview } from '@repo/core-sync';
import {
  FEED_TARGETS,
  validateFeedMapping,
  type FeedMapping,
  type FeedMappingIssue,
  type FeedTargetKey,
} from '@repo/core-sync/feed-mapping';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useState, useTransition } from 'react';

import type { Dictionary } from '../../../lib/i18n';
import { connectFeed, previewFeed } from './actions';
import { ConnectionForm } from './ConnectionForm';
import styles from './new.module.css';
import w from './wizard.module.css';

type T = Dictionary['integrationsNew'];
type W = T['wizard'];
type Step = 1 | 2 | 3;

const INTERVALS = [null, 60, 360, 1440] as const;
type Interval = (typeof INTERVALS)[number];

const fill = (template: string, values: Record<string, string | number> = {}) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

/** "www.luzkovinysmolka.cz" → "luzkovinysmolka.cz", a first guess for the name. */
function defaultName(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * /integrations/new/feed, from design/figma/Configure XML Feed Mapping.json:
 * 1. source (URL + structure check), 2. map every XML tag to a column,
 * 3. name and scheduled import, then "Připojit feed" saves it and the API
 * imports it at once. Nothing goes to Flexi.
 */
export function FeedWizard({ t }: { t: T }) {
  const tw = t.wizard;
  const [step, setStep] = useState<Step>(1);
  const [source, setSource] = useState<{ url: string; info: FeedCheckInfo } | null>(null);
  const [preview, setPreview] = useState<FeedPreview | null>(null);
  const [mapping, setMapping] = useState<FeedMapping>({});
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<Interval>(1440);

  const onContinue = (values: Record<string, string>, info: FeedCheckInfo) => {
    const url = values.url!.trim();
    if (source?.url !== url || source.info.itemElement !== info.itemElement) {
      setPreview(null);
      setMapping({});
      setName(defaultName(url));
    }
    setSource({ url, info });
    setStep(2);
  };

  return (
    <>
      <Stepper step={step} t={tw} />
      {step === 1 && <ConnectionForm kind="feed" t={t} initial={source ? { url: source.url } : undefined} onContinue={onContinue} />}
      {step > 1 && source && (
        <>
          <ContextBar url={source.url} info={source.info} items={preview?.items ?? source.info.items} t={t} />
          {step === 2 ? (
            <MappingStep
              url={source.url}
              itemElement={source.info.itemElement!}
              preview={preview}
              setPreview={(p) => {
                setPreview(p);
                setMapping(p.mapping);
              }}
              mapping={mapping}
              setMapping={setMapping}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
              t={tw}
            />
          ) : (
            <ScheduleStep
              source={source}
              items={preview?.items ?? source.info.items}
              mapping={mapping}
              name={name}
              setName={setName}
              frequency={frequency}
              setFrequency={setFrequency}
              onBack={() => setStep(2)}
              t={t}
            />
          )}
        </>
      )}
    </>
  );
}

function Stepper({ step, t }: { step: Step; t: W }) {
  const steps = [t.steps.source, t.steps.mapping, t.steps.schedule];
  return (
    <nav className={w.stepper} aria-label={t.label}>
      <ol>
        {steps.map((label, i) => {
          const n = (i + 1) as Step;
          const state = n < step ? 'done' : n === step ? 'current' : 'todo';
          return (
            <li key={label} className={`${w.stepperItem} ${w[`stepper_${state}`]}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={w.stepperNum} aria-hidden>
                {state === 'done' ? '✓' : n}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
      <span className={`${w.stepperLine} ${w[`progress_${step}`]}`} aria-hidden />
    </nav>
  );
}

function ContextBar({ url, info, items, t }: { url: string; info: FeedCheckInfo; items: number; t: T }) {
  const dialect = (t.feed.dialects as Record<string, string>)[info.dialect] ?? info.dialect;
  return (
    <section className={w.context} aria-label={t.wizard.steps.source}>
      <div className={w.contextMain}>
        <span className={w.contextBadge}>{dialect}</span>
        <code className={w.contextUrl} title={url}>
          {url}
        </code>
      </div>
      <p className={w.contextMeta}>
        <span className={w.liveDot} aria-hidden />
        {fill(t.wizard.context, { items: items.toLocaleString(), element: info.itemElement ?? '?' })}
      </p>
    </section>
  );
}

function issueText(issue: FeedMappingIssue, t: W): string {
  const target = (key: FeedTargetKey) => t.targets[key];
  if (issue.code === 'missing') return fill(t.mapping.issues.missing, { target: target(issue.target) });
  if (issue.code === 'duplicate') {
    return fill(t.mapping.issues.duplicate, { target: target(issue.target), tags: issue.tags.join(', ') });
  }
  return fill(t.mapping.issues.unknownTag, { tag: issue.tag });
}

function MappingStep({
  url,
  itemElement,
  preview,
  setPreview,
  mapping,
  setMapping,
  onBack,
  onNext,
  t,
}: {
  url: string;
  itemElement: string;
  preview: FeedPreview | null;
  setPreview: (p: FeedPreview) => void;
  mapping: FeedMapping;
  setMapping: (m: FeedMapping) => void;
  onBack: () => void;
  onNext: () => void;
  t: W;
}) {
  const tm = t.mapping;
  const id = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(() => {
    start(async () => {
      setError(null);
      const r = await previewFeed(url, itemElement);
      if (r.ok) setPreview(r.preview);
      else setError(r.message);
    });
  }, [url, itemElement, setPreview]);

  useEffect(() => {
    if (!preview) load();
  }, [preview, load]);

  const tags = useMemo(() => preview?.tags ?? [], [preview]);
  const issues = useMemo(() => (preview ? validateFeedMapping(mapping, tags.map((x) => x.tag)) : []), [mapping, preview, tags]);
  const keyTag = Object.entries(mapping).find(([, target]) => target === 'kod')?.[0];
  const mapped = Object.keys(mapping).length;
  const columns = new Set(Object.values(mapping)).size;

  const q = filter.trim().toLowerCase();
  const shown = q
    ? tags.filter(
        (x) =>
          x.tag.toLowerCase().includes(q) ||
          x.sample.toLowerCase().includes(q) ||
          (mapping[x.tag] && t.targets[mapping[x.tag]!].toLowerCase().includes(q)),
      )
    : tags;

  const setTarget = (tag: string, value: string) => {
    const next = { ...mapping };
    if (value === '') delete next[tag];
    else next[tag] = value as FeedTargetKey;
    setMapping(next);
  };

  return (
    <section className={`${styles.card} ${w.mapCard}`} aria-labelledby={`${id}-title`} aria-busy={pending}>
      <div className={w.toolbar}>
        <div className={w.toolbarText}>
          <h2 id={`${id}-title`} className={styles.cardTitle}>
            {tm.title}
          </h2>
          <p className={w.toolbarSub}>{tm.subtitle}</p>
          <label className={w.search}>
            <span className={w.searchIcon} aria-hidden />
            <span className={w.visuallyHidden}>{tm.filter}</span>
            <input
              type="search"
              className={styles.input}
              placeholder={tm.filter}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              disabled={!preview}
            />
          </label>
        </div>
        <p className={w.keyCapsule}>
          <span className={w.keyIcon} aria-hidden />
          <span>
            <span className={w.keyLabel}>{tm.primaryKey}</span>
            <strong>{keyTag ? `<${keyTag}> → ${t.targets.kod.replace(/ \(.*\)$/, '')}` : tm.noKey}</strong>
          </span>
        </p>
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          <p>{fill(tm.loadFailed, { message: error })}</p>
          <button type="button" className={`${styles.secondary} ${w.retry}`} onClick={load} disabled={pending}>
            {tm.retry}
          </button>
        </div>
      ) : !preview ? (
        <p className={w.loading} role="status">
          <span className={w.spinner} aria-hidden />
          {tm.loading}
        </p>
      ) : (
        <div className={w.tableWrap}>
          <table className={w.table}>
            <thead>
              <tr>
                <th scope="col">{tm.colTag}</th>
                <th scope="col" className={w.num}>
                  {tm.colCount}
                </th>
                <th scope="col">{tm.colTarget}</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={3} className={w.empty}>
                    {tm.noMatch}
                  </td>
                </tr>
              ) : (
                shown.map((x) => {
                  const target = mapping[x.tag];
                  const bad = issues.some((i) => i.code === 'duplicate' && i.tags.includes(x.tag));
                  return (
                    <tr key={x.tag} className={target ? w.mappedRow : w.ignoredRow}>
                      <td>
                        <code className={w.tag}>{`<${x.tag}>`}</code>
                        <span className={w.sample} title={x.sample}>
                          {x.sample ? fill(tm.sample, { value: x.sample }) : tm.noSample}
                        </span>
                      </td>
                      <td className={w.num}>{fill(tm.count, { n: x.items.toLocaleString(), total: preview.items.toLocaleString() })}</td>
                      <td>
                        <select
                          className={`${styles.input} ${w.select} ${bad ? w.selectBad : ''}`}
                          value={target ?? ''}
                          onChange={(e) => setTarget(x.tag, e.target.value)}
                          aria-label={`${tm.colTarget}: ${x.tag}`}
                          aria-invalid={bad || undefined}
                        >
                          <option value="">{tm.ignore}</option>
                          {FEED_TARGETS.map((ft) => (
                            <option key={ft.key} value={ft.key}>
                              {t.targets[ft.key]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className={w.footer}>
        <div className={w.validation} role="status" aria-live="polite">
          {preview && (
            <>
              <span className={`${w.badge} ${issues.length ? w.badgeBad : w.badgeOk}`}>{issues.length ? '!' : '✓'}</span>
              <div>
                <strong>{issues.length ? tm.invalid : tm.valid}</strong>
                {issues.length ? (
                  <ul>
                    {issues.map((i) => (
                      <li key={JSON.stringify(i)}>{issueText(i, t)}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{fill(tm.validText, { n: mapped, columns })}</p>
                )}
              </div>
            </>
          )}
        </div>
        <div className={w.actions}>
          {preview && (
            <button type="button" className={w.link} onClick={() => setMapping(preview.mapping)}>
              {tm.reset}
            </button>
          )}
          <button type="button" className={styles.secondary} onClick={onBack}>
            {tm.back}
          </button>
          <button type="button" className={styles.primary} onClick={onNext} disabled={!preview || issues.length > 0}>
            {tm.next}
          </button>
        </div>
      </div>
    </section>
  );
}

function ScheduleStep({
  source,
  items,
  mapping,
  name,
  setName,
  frequency,
  setFrequency,
  onBack,
  t,
}: {
  source: { url: string; info: FeedCheckInfo };
  items: number;
  mapping: FeedMapping;
  name: string;
  setName: (v: string) => void;
  frequency: Interval;
  setFrequency: (v: Interval) => void;
  onBack: () => void;
  t: T;
}) {
  const ts = t.wizard.schedule;
  const id = useId();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const columns = [...new Set(Object.values(mapping))].map((k) => t.wizard.targets[k]);
  const dialect = (t.feed.dialects as Record<string, string>)[source.info.dialect] ?? source.info.dialect;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await connectFeed({
        url: source.url,
        name: name.trim(),
        dialect: source.info.dialect,
        itemElement: source.info.itemElement!,
        mapping,
        importIntervalMinutes: frequency,
      });
      if (r.ok) router.push('/integrations?type=feed');
      else setError(r.message);
    });
  };

  return (
    <div className={styles.grid}>
      <form className={`${styles.card} ${styles.mainCard}`} onSubmit={onSubmit} aria-labelledby={`${id}-title`}>
        <div>
          <h2 id={`${id}-title`} className={styles.cardTitle}>
            {ts.title}
          </h2>
          <p className={w.toolbarSub}>{ts.subtitle}</p>
        </div>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label htmlFor={`${id}-name`} className={styles.label}>
              {ts.name}
              <span className={styles.req} aria-hidden>
                *
              </span>
            </label>
            <input
              id={`${id}-name`}
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              required
              aria-describedby={`${id}-name-hint`}
            />
            <p id={`${id}-name-hint`} className={styles.hint}>
              {ts.nameHint}
            </p>
          </div>
          <fieldset className={w.intervals}>
            <legend className={styles.label}>{ts.interval}</legend>
            {INTERVALS.map((v) => (
              <label key={String(v)} className={w.interval}>
                <input type="radio" name="interval" checked={frequency === v} onChange={() => setFrequency(v)} />
                <span>{ts.intervals[v === null ? 'manual' : (String(v) as '60' | '360' | '1440')]}</span>
              </label>
            ))}
          </fieldset>
        </div>
        {error && (
          <div className={styles.error} role="alert">
            <p>{error}</p>
          </div>
        )}
        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={onBack} disabled={pending}>
            {ts.back}
          </button>
          <button type="submit" className={styles.primary} disabled={pending || !name.trim()}>
            {pending ? ts.saving : ts.save}
          </button>
        </div>
      </form>

      <aside className={styles.side}>
        <section className={styles.card} aria-labelledby={`${id}-summary`}>
          <h2 id={`${id}-summary`} className={styles.cardTitle}>
            {ts.summary}
          </h2>
          <dl className={w.summary}>
            <dt>{ts.summaryUrl}</dt>
            <dd title={source.url}>{source.url}</dd>
            <dt>{ts.summaryFormat}</dt>
            <dd>{dialect}</dd>
            <dt>{ts.summaryItems}</dt>
            <dd>{items.toLocaleString()}</dd>
            <dt>{ts.summaryColumns}</dt>
            <dd>{columns.join(', ')}</dd>
          </dl>
          <p className={styles.hint}>{ts.noFlexi}</p>
        </section>
      </aside>
    </div>
  );
}
