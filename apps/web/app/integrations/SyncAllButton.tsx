'use client';

import { useState, useTransition } from 'react';

import { syncAll, type SyncAllResult } from './actions';
import styles from './integrations.module.css';

/** "Synchronizovat vše" with its result in a live region under the button. */
export function SyncAllButton({
  labels,
}: {
  labels: { syncAll: string; syncAllHint: string; syncing: string };
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<SyncAllResult | null>(null);

  return (
    <>
      <button
        type="button"
        className={styles.primary}
        title={labels.syncAllHint}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await syncAll());
          })
        }
      >
        <span className={`${styles.syncIcon} ${pending ? styles.spinning : ''}`} aria-hidden />
        {pending ? labels.syncing : labels.syncAll}
      </button>
      <p className={result && !result.ok ? styles.syncError : styles.syncMessage} role="status" aria-live="polite">
        {result?.message}
      </p>
    </>
  );
}
