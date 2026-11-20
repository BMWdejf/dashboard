'use client';

import {
  COMPARE_PERIODS,
  LOW_STOCK_MODES,
  TREND_FORMATS,
  type ProductSettings,
} from '@repo/core-db/settings';
import { useState, useTransition } from 'react';

import type { Dictionary } from '../../../lib/i18n';
import dash from '../../dashboard/dashboard.module.css';
import { saveProductSettings } from '../actions';
import styles from '../settings.module.css';

interface Props {
  initial: ProductSettings;
  t: Dictionary['settings']['products'];
  labels: Dictionary['common'];
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Settings → Products: how the KPI cards on /products are calculated. Every
 * change saves the whole settings object at once; on failure the form goes
 * back to the last saved state.
 */
export function ProductSettingsForm({ initial, t, labels }: Props) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  // The threshold is typed freely and saved on blur.
  const [threshold, setThreshold] = useState(String(initial.lowStockThreshold));
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  function update(patch: Partial<ProductSettings>) {
    const next = { ...form, ...patch };
    setForm(next);
    setStatus('saving');
    startTransition(async () => {
      const result = await saveProductSettings(next);
      if (result.ok) {
        setSaved(next);
        setStatus('saved');
      } else {
        setForm(saved);
        setThreshold(String(saved.lowStockThreshold));
        setError(result.error);
        setStatus('error');
      }
    });
  }

  function commitThreshold() {
    const n = Number(threshold);
    if (Number.isInteger(n) && n >= 1 && n !== form.lowStockThreshold) update({ lowStockThreshold: n });
    else setThreshold(String(form.lowStockThreshold));
  }

  return (
    <form className={dash.stack} onSubmit={(e) => e.preventDefault()}>
      <p className={dash.cardText}>{t.intro}</p>

      <fieldset className={`${dash.card} ${styles.group}`}>
        <legend className={styles.legend}>{t.trends}</legend>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.showTrends}
            onChange={(e) => update({ showTrends: e.target.checked })}
          />
          {t.showTrends}
        </label>
        <div className={styles.fields}>
          <label className={styles.field}>
            <span>{t.compareWith}</span>
            <select
              value={form.comparePeriod}
              disabled={!form.showTrends}
              onChange={(e) => update({ comparePeriod: e.target.value as ProductSettings['comparePeriod'] })}
            >
              {COMPARE_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {t.periods[p]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>{t.trendFormat}</span>
            <select
              value={form.trendFormat}
              disabled={!form.showTrends}
              onChange={(e) => update({ trendFormat: e.target.value as ProductSettings['trendFormat'] })}
            >
              {TREND_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {t.formats[f]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={dash.cardText}>{t.historyNote}</p>
      </fieldset>

      <fieldset className={`${dash.card} ${styles.group}`}>
        <legend className={styles.legend}>{t.lowStock}</legend>
        {LOW_STOCK_MODES.map((m) => (
          <label key={m} className={styles.check}>
            <input
              type="radio"
              name="lowStockMode"
              value={m}
              checked={form.lowStockMode === m}
              onChange={() => update({ lowStockMode: m })}
            />
            {t.lowStockModes[m]}
          </label>
        ))}
        {form.lowStockMode === 'threshold' ? (
          <label className={styles.field}>
            <span>{t.threshold}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              onBlur={commitThreshold}
              onKeyDown={(e) => e.key === 'Enter' && commitThreshold()}
            />
          </label>
        ) : (
          <p className={dash.cardText}>{t.lowStockFlexiHint}</p>
        )}
      </fieldset>

      <fieldset className={`${dash.card} ${styles.group}`}>
        <legend className={styles.legend}>{t.scope}</legend>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.includeServices}
            onChange={(e) => update({ includeServices: e.target.checked })}
          />
          {t.includeServices}
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={form.eshopOnly}
            onChange={(e) => update({ eshopOnly: e.target.checked })}
          />
          {t.eshopOnly}
        </label>
      </fieldset>

      <p className={dash.saveStatus} aria-live="polite" role="status">
        {status === 'saving' && labels.saving}
        {status === 'saved' && labels.saved}
        {status === 'error' && error}
      </p>
    </form>
  );
}
