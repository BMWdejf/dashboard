'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import dash from '../dashboard/dashboard.module.css';
import styles from './products.module.css';

/** Wait this long after the last keystroke before searching. */
const DEBOUNCE_MS = 300;

/**
 * Product search that updates the list while typing (no Enter needed). It
 * keeps the page size, starts again on page 1 and replaces the history entry,
 * so Back doesn't step through every letter. Without JavaScript it is a plain
 * GET form.
 */
export function ProductSearch({
  initial,
  label,
  placeholder,
  submitLabel,
}: {
  initial: string;
  label: string;
  placeholder: string;
  submitLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Clear a pending search when leaving the page.
  useEffect(() => () => clearTimeout(timer.current), []);

  function go(q: string) {
    const next = new URLSearchParams(params.toString());
    next.delete('page');
    if (q.trim()) next.set('q', q.trim());
    else next.delete('q');
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <form
      className={styles.search}
      role="search"
      action={pathname}
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(timer.current);
        go(value);
      }}
    >
      <label>
        <span className={dash.visuallyHidden}>{label}</span>
        <span className={dash.searchIcon} aria-hidden />
        <input
          type="search"
          name="q"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          aria-busy={pending}
          onChange={(e) => {
            const q = e.target.value;
            setValue(q);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => go(q), DEBOUNCE_MS);
          }}
        />
        {pending && <span className={styles.searchSpinner} aria-hidden />}
      </label>
      {params.get('per') && <input type="hidden" name="per" value={params.get('per')!} />}
      <button type="submit" className={dash.visuallyHidden}>
        {submitLabel}
      </button>
    </form>
  );
}
