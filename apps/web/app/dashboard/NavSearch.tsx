'use client';

import Link from 'next/link';
import { useState } from 'react';

import styles from './dashboard.module.css';

export interface NavItem {
  href?: string;
  label: string;
}

interface Props {
  items: NavItem[];
  active: string;
}

/** Search box + navigation from the design's Sidebar Wrapper. The search filters the links. */
export function NavSearch({ items, active }: Props) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;

  return (
    <>
      <label className={styles.search}>
        <span className={styles.visuallyHidden}>Hledat v menu</span>
        <span className={styles.searchIcon} aria-hidden />
        <input
          type="search"
          placeholder="Hledat…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <nav className={styles.nav} aria-label="Hlavní navigace">
        {shown.map((item) =>
          item.href ? (
            <Link
              key={item.label}
              href={item.href}
              className={styles.navItem}
              aria-current={item.href === active ? 'page' : undefined}
            >
              <span className={styles.navDot} aria-hidden />
              {item.label}
            </Link>
          ) : (
            <span
              key={item.label}
              className={`${styles.navItem} ${styles.navSoon}`}
              aria-disabled
              title="Připravujeme"
            >
              <span className={styles.navDot} aria-hidden />
              {item.label}
              <span className={styles.soonTag}>brzy</span>
            </span>
          ),
        )}
        {shown.length === 0 && <p className={styles.navEmpty}>Nic nenalezeno.</p>}
      </nav>
    </>
  );
}
