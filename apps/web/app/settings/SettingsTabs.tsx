'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import styles from './settings.module.css';

interface Props {
  label: string;
  tabs: { href: string; label: string }[];
}

/** Sub-navigation of Settings (Profile, Products); the current one is marked. */
export function SettingsTabs({ label, tabs }: Props) {
  const pathname = usePathname();
  return (
    <nav className={styles.tabs} aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={styles.tab}
          aria-current={pathname === tab.href ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
