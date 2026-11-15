'use client';

import type { Theme } from '@repo/core-db/theme';
import { useState, useTransition } from 'react';

import styles from '../dashboard/dashboard.module.css';
import { saveTheme } from './actions';

const OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: 'dark', label: 'Tmavý', hint: 'Vždy tmavý vzhled' },
  { value: 'light', label: 'Světlý', hint: 'Vždy světlý vzhled' },
  { value: 'system', label: 'Podle systému', hint: 'Řídí se nastavením zařízení' },
];

type Status = 'idle' | 'saving' | 'saved' | 'error';

/** Switches the page's theme right away, before the save finishes. */
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Theme choice in the profile. Applies at once and saves itself on change;
 * there is no save button. On failure it switches back and says so.
 */
export function ThemePicker({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  function choose(next: Theme) {
    if (next === theme) return;
    const previous = theme;
    setTheme(next);
    applyTheme(next);
    setStatus('saving');
    startTransition(async () => {
      const result = await saveTheme(next);
      if (result.ok) {
        setStatus('saved');
      } else {
        setTheme(previous);
        applyTheme(previous);
        setError(result.error);
        setStatus('error');
      }
    });
  }

  return (
    <fieldset className={styles.themePicker}>
      <legend className={styles.cardTitle}>Vzhled</legend>
      <div className={styles.segmented} role="radiogroup" aria-label="Motiv">
        {OPTIONS.map((o) => (
          <label key={o.value} className={styles.segment} title={o.hint}>
            <input
              type="radio"
              name="theme"
              value={o.value}
              checked={theme === o.value}
              onChange={() => choose(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <p className={styles.saveStatus} aria-live="polite" role="status">
        {status === 'saving' && 'Ukládám…'}
        {status === 'saved' && 'Uloženo'}
        {status === 'error' && error}
      </p>
    </fieldset>
  );
}
