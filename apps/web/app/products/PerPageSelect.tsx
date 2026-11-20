'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import styles from './products.module.css';

/** "Rows per page" from the design's footer; changing it goes back to page 1. */
export function PerPageSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: number;
  options: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return (
    <label className={styles.perPage}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.delete('page');
          if (e.target.value === String(options[0])) next.delete('per');
          else next.set('per', e.target.value);
          const qs = next.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
