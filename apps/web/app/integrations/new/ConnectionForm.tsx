'use client';

import type { CheckStep, FeedCheckInfo, FlexiCheckInfo, ShoptetCheckInfo } from '@repo/core-sync';
import Link from 'next/link';
import { useId, useState, useTransition } from 'react';

import type { Dictionary } from '../../../lib/i18n';
import { runCheck, type AnyCheckResult, type ConnectionKind } from './actions';
import styles from './new.module.css';

type T = Dictionary['integrationsNew'];

/** Local copy of lib/i18n fill(), so the client bundle doesn't pull in both dictionaries. */
const fill = (template: string, values: Record<string, string | number> = {}) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));

const STEP_KEYS: Record<ConnectionKind, string[]> = {
  flexi: ['dns', 'connect', 'auth'],
  shoptet: ['connect', 'auth', 'eshop'],
  feed: ['endpoint', 'xml', 'dialect'],
};

const INITIAL: Record<ConnectionKind, Record<string, string>> = {
  flexi: { host: '', port: '5434', user: '', password: '' },
  shoptet: { token: '' },
  feed: { url: '' },
};

/**
 * One configuration page: the form (left card), the live diagnostic and the
 * security guide (right column). "Test" runs the API's pre-flight check.
 * Flexi and Shoptet save nothing, so after a good test the page shows the env
 * lines to set; a feed continues to the mapping step (`onContinue`).
 */
export function ConnectionForm({
  kind,
  t,
  initial,
  onContinue,
}: {
  kind: ConnectionKind;
  t: T;
  initial?: Record<string, string>;
  onContinue?: (values: Record<string, string>, info: FeedCheckInfo) => void;
}) {
  const tk = t[kind];
  const [values, setValues] = useState(initial ?? INITIAL[kind]);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AnyCheckResult | null>(null);
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null);
  const [company, setCompany] = useState('');
  const id = useId();

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    // A changed field makes the last result stale.
    setResult(null);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await runCheck(kind, values);
      if (r.ok) {
        setResult(r.result);
        const companies = kind === 'flexi' ? (r.result.info as FlexiCheckInfo | null)?.companies : undefined;
        setCompany(companies?.[0]?.dbNazev ?? '');
      } else {
        setResult(null);
        setError({ message: r.message, details: r.details });
      }
    });
  };

  const anyWarn = result?.steps.some((s) => s.status === 'warn');
  const pill = pending
    ? { text: t.pill.testing, tone: 'pillTesting' }
    : !result
      ? { text: t.pill.ready, tone: error ? 'pillFailed' : 'pillReady' }
      : result.ok
        ? { text: anyWarn ? t.pill.warn : t.pill.ok, tone: anyWarn ? 'pillWarn' : 'pillOk' }
        : { text: t.pill.failed, tone: 'pillFailed' };

  const steps: (CheckStep | { key: string; status: 'pending' })[] =
    result?.steps ?? STEP_KEYS[kind].map((key) => ({ key, status: 'pending' as const }));

  const field = (name: string, label: string, hint: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={styles.field}>
      <label htmlFor={`${id}-${name}`} className={styles.label}>
        {label}
        <span className={styles.req} aria-hidden>
          *
        </span>
      </label>
      <input
        id={`${id}-${name}`}
        name={name}
        className={styles.input}
        value={values[name] ?? ''}
        onChange={set(name)}
        required
        aria-describedby={`${id}-${name}-hint`}
        {...props}
      />
      <p id={`${id}-${name}-hint`} className={styles.hint}>
        {hint}
      </p>
    </div>
  );

  const insecure = (values.url ?? '').trim().toLowerCase().startsWith('http://');
  const testLabel = kind === 'feed' ? t.feed.test : t.test;
  const saveLabel = kind === 'feed' ? t.feed.save : t.save;
  const feedInfo = kind === 'feed' && result?.ok ? (result.info as FeedCheckInfo | null) : null;
  const canContinue = !!onContinue && !!feedInfo?.itemElement && !pending;

  return (
    <>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>{tk.title}</h1>
          <p className={styles.subtitle}>{tk.subtitle}</p>
        </div>
        <span className={`${styles.pill} ${styles[pill.tone]}`} role="status" aria-live="polite">
          <span className={styles.beacon} aria-hidden />
          {pill.text}
        </span>
      </div>

      <div className={styles.grid}>
        <form className={`${styles.card} ${styles.mainCard}`} onSubmit={onSubmit}>
          <div className={styles.cardHead}>
            <div>
              <h2 className={styles.cardTitle}>{tk.cardTitle}</h2>
              <p className={styles.cardSubtitle}>{tk.cardSubtitle}</p>
            </div>
            {kind === 'feed' && <span className={styles.batch}>{t.feed.batch}</span>}
          </div>
          <nav className={styles.tabs} aria-label={t.tabs.label}>
            {(['flexi', 'shoptet', 'feed'] as const).map((k) => (
              <Link key={k} href={`/integrations/new/${k}`} className={styles.tab} aria-current={k === kind ? 'page' : undefined}>
                {t.tabs[k]}
              </Link>
            ))}
          </nav>

          <div className={styles.fields}>
            {kind === 'flexi' && (
              <>
                <div className={styles.row}>
                  <div className={`${styles.field} ${styles.wide}`}>
                    <label htmlFor={`${id}-host`} className={styles.label}>
                      {t.flexi.host}
                      <span className={styles.req} aria-hidden>
                        *
                      </span>
                    </label>
                    <div className={styles.addon}>
                      <span aria-hidden>https://</span>
                      <input
                        id={`${id}-host`}
                        name="host"
                        className={styles.input}
                        value={values.host ?? ''}
                        onChange={set('host')}
                        placeholder="mojefirma.flexibee.eu"
                        autoComplete="off"
                        spellCheck={false}
                        required
                        aria-describedby={`${id}-host-hint`}
                      />
                      <span aria-hidden>/</span>
                    </div>
                    <p id={`${id}-host-hint`} className={styles.hint}>
                      {t.flexi.hostHint}
                    </p>
                  </div>
                  {field('port', t.flexi.port, t.flexi.portHint, { inputMode: 'numeric', pattern: '[0-9]{1,5}' })}
                </div>
                <div className={styles.row2}>
                  {field('user', t.flexi.user, t.flexi.userHint, { autoComplete: 'off', spellCheck: false })}
                  {field('password', t.flexi.password, t.flexi.passwordHint, { type: 'password', autoComplete: 'new-password' })}
                </div>
              </>
            )}
            {kind === 'shoptet' &&
              field('token', t.shoptet.token, t.shoptet.tokenHint, { type: 'password', autoComplete: 'off', spellCheck: false })}
            {kind === 'feed' && (
              <div className={styles.field}>
                <label htmlFor={`${id}-url`} className={styles.label}>
                  {t.feed.url}
                  <span className={styles.req} aria-hidden>
                    *
                  </span>
                </label>
                <div className={styles.addon}>
                  <input
                    id={`${id}-url`}
                    name="url"
                    type="url"
                    className={styles.input}
                    value={values.url ?? ''}
                    onChange={set('url')}
                    placeholder="https://dodavatel.cz/feeds/katalog.xml"
                    spellCheck={false}
                    required
                    aria-describedby={`${id}-url-hint`}
                  />
                  <span className={insecure ? styles.schemeWarn : styles.scheme}>
                    {insecure ? 'HTTP' : 'HTTPS'}
                  </span>
                </div>
                <p id={`${id}-url-hint`} className={styles.hint}>
                  {t.feed.urlHint}
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className={styles.error} role="alert">
              <p>{error.message}</p>
              {error.details.length > 0 && (
                <ul>
                  {error.details.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result?.ok && <EnvLines kind={kind} values={values} result={result} company={company} setCompany={setCompany} t={t} />}

          <div className={styles.footer}>
            <button type="submit" className={styles.secondary} disabled={pending}>
              {pending ? t.testing : testLabel}
            </button>
            {canContinue ? (
              <button type="button" className={styles.primary} onClick={() => onContinue!(values, feedInfo!)}>
                {saveLabel}
              </button>
            ) : (
              <>
                <button type="button" className={styles.primary} aria-disabled="true" title={tk.saveHint} aria-describedby={`${id}-save`}>
                  {saveLabel}
                </button>
                <p id={`${id}-save`} className={styles.saveHint}>
                  {tk.saveHint}
                </p>
              </>
            )}
          </div>
        </form>

        <aside className={styles.side}>
          <section className={styles.card} aria-labelledby={`${id}-diag`}>
            <h2 id={`${id}-diag`} className={styles.cardTitle}>
              {t.diagnostic.title}
            </h2>
            <p className={styles.cardSubtitle}>{t.diagnostic.subtitle}</p>
            <ol className={styles.steps} aria-busy={pending}>
              {steps.map((s) => (
                <StepItem key={s.key} kind={kind} step={s} t={t} />
              ))}
            </ol>
            <Telemetry kind={kind} result={result} t={t} />
          </section>
          <Guide kind={kind} t={t} />
        </aside>
      </div>
    </>
  );
}

function StepItem({ kind, step, t }: { kind: ConnectionKind; step: CheckStep | { key: string; status: 'pending' }; t: T }) {
  const meta = (t[kind].steps as Record<string, { title: string; pending: string }>)[step.key];
  const codes = t.codes as Record<string, string>;
  const badges = t.badges as Record<string, string>;
  const isPending = step.status === 'pending';
  const params = isPending ? {} : (step.params ?? {});
  let badge = isPending ? t.status.pending : badges[step.code] ? fill(badges[step.code]!, params) : t.status[step.status];
  if (!isPending && kind === 'feed' && step.key === 'dialect' && (step.status === 'ok' || step.status === 'warn')) {
    badge = (t.feed.dialects as Record<string, string>)[String(params.dialect ?? 'custom')] ?? badge;
  }
  const text = isPending ? meta?.pending : fill(codes[step.code] ?? step.code, params);
  return (
    <li className={`${styles.step} ${styles[`step_${step.status}`]}`}>
      <span className={styles.stepIcon} aria-hidden />
      <div className={styles.stepBody}>
        <div className={styles.stepHead}>
          <strong>{meta?.title ?? step.key}</strong>
          <span className={styles.stepBadge}>{badge}</span>
        </div>
        <p>{text}</p>
      </div>
    </li>
  );
}

function Telemetry({ kind, result, t }: { kind: ConnectionKind; result: AnyCheckResult | null; t: T }) {
  const feed = kind === 'feed' ? (result?.info as FeedCheckInfo | null) : null;
  const text = feed
    ? fill(t.feed.telemetry, {
        s: (feed.parseMs / 1000).toFixed(1),
        mb: (feed.bytes / 1024 / 1024).toFixed(1),
        encoding: feed.encoding.toUpperCase(),
      })
    : result?.latencyMs != null
      ? fill(t.diagnostic.latency, { ms: result.latencyMs })
      : t.diagnostic.noLatency;
  return (
    <div className={styles.telemetry}>
      <span>{text}</span>
      <span className={styles.format}>{t[kind].format}</span>
    </div>
  );
}

function EnvLines({
  kind,
  values,
  result,
  company,
  setCompany,
  t,
}: {
  kind: ConnectionKind;
  values: Record<string, string>;
  result: AnyCheckResult;
  company: string;
  setCompany: (v: string) => void;
  t: T;
}) {
  const id = useId();
  if (kind === 'feed') return null;
  if (kind === 'shoptet') {
    const info = result.info as ShoptetCheckInfo | null;
    return (
      <div className={styles.env}>
        <h3>{t.env.title}</h3>
        <p>{t.env.note}</p>
        <pre>{`SHOPTET_PRIVATE_API_TOKEN=${t.env.token}`}</pre>
        {info?.name && <p className={styles.hint}>{fill(t.codes.found, { name: info.name })}</p>}
      </div>
    );
  }
  const info = result.info as FlexiCheckInfo | null;
  const companies = info?.companies ?? [];
  return (
    <div className={styles.env}>
      <h3>{t.env.title}</h3>
      <p>{t.env.note}</p>
      {companies.length > 1 && (
        <label className={styles.companyPick} htmlFor={`${id}-company`}>
          {t.env.company}
          <select id={`${id}-company`} value={company} onChange={(e) => setCompany(e.target.value)} className={styles.input}>
            {companies.map((c) => (
              <option key={c.dbNazev} value={c.dbNazev}>
                {c.nazev} ({c.dbNazev})
              </option>
            ))}
          </select>
        </label>
      )}
      <pre>
        {[
          `FLEXI_URL=${info?.url ?? ''}`,
          `FLEXI_COMPANY=${company}`,
          `FLEXI_USER=${values.user}`,
          `FLEXI_PASSWORD=${t.env.password}`,
        ].join('\n')}
      </pre>
    </div>
  );
}

function Guide({ kind, t }: { kind: ConnectionKind; t: T }) {
  const items: [string, string][] =
    kind === 'flexi'
      ? [
          [t.flexi.guideRole, t.flexi.guideRoleText],
          [t.flexi.guideFirewall, t.flexi.guideFirewallText],
        ]
      : kind === 'shoptet'
        ? [
            [t.shoptet.guideScope, t.shoptet.guideScopeText],
            [t.shoptet.guideWrites, t.shoptet.guideWritesText],
          ]
        : [
            [t.feed.guideNetwork, t.feed.guideNetworkText],
            [t.feed.guideLimits, t.feed.guideLimitsText],
          ];
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t.guide.title}</h2>
      <ul className={styles.guide}>
        {[[t.guide.notStored, t.guide.notStoredText] as [string, string], ...items].map(([title, text]) => (
          <li key={title}>
            <span className={styles.guideIcon} aria-hidden />
            <div>
              <strong>{title}</strong>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ul>
      <a className={styles.docs} href={t[kind].docsUrl} target="_blank" rel="noopener noreferrer">
        {t.guide.docs}
        <span className={styles.arrow} aria-hidden />
      </a>
    </section>
  );
}
