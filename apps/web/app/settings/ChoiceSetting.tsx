'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import styles from '../dashboard/dashboard.module.css';
import { saveLanguage, savePriceMode, saveTheme, type SaveResult } from './actions';

/** Which preference this control edits; decides the action and side effects. */
export type ChoiceKind = 'theme' | 'language' | 'priceMode';

const ACTIONS: Record<ChoiceKind, (value: string) => Promise<SaveResult>> = {
  theme: saveTheme,
  language: saveLanguage,
  priceMode: savePriceMode,
};

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
}

interface Props {
  kind: ChoiceKind;
  legend: string;
  hint?: string;
  options: ChoiceOption[];
  initial: string;
  labels: { saving: string; saved: string };
}

type Status = 'idle' | 'saving' | 'saved' | 'error';

/**
 * A segmented choice that saves itself on change; there is no save button.
 * The theme switches at once; a new language re-renders the page. On failure
 * it switches back and says why.
 */
export function ChoiceSetting({ kind, legend, hint, options, initial, labels }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  const apply = (v: string) => {
    if (kind === 'theme') document.documentElement.setAttribute('data-theme', v);
  };

  function choose(next: string) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    apply(next);
    setStatus('saving');
    startTransition(async () => {
      const result = await ACTIONS[kind](next);
      if (result.ok) {
        setStatus('saved');
        if (kind !== 'theme') router.refresh();
      } else {
        setValue(previous);
        apply(previous);
        setError(result.error);
        setStatus('error');
      }
    });
  }

  return (
    <fieldset className={styles.themePicker}>
      <legend className={styles.cardTitle}>{legend}</legend>
      {hint && <p className={styles.cardText}>{hint}</p>}
      <div className={styles.segmented} role="radiogroup" aria-label={legend}>
        {options.map((o) => (
          <label key={o.value} className={styles.segment} title={o.hint}>
            <input
              type="radio"
              name={kind}
              value={o.value}
              checked={value === o.value}
              onChange={() => choose(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <p className={styles.saveStatus} aria-live="polite" role="status">
        {status === 'saving' && labels.saving}
        {status === 'saved' && labels.saved}
        {status === 'error' && error}
      </p>
    </fieldset>
  );
}
