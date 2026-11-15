import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';

import Link from 'next/link';

import { signOut } from '../auth/actions';
import styles from './dashboard.module.css';

interface Props {
  user: { name: string; email: string };
  /** Path of the current page, to highlight it in the navigation. */
  active: '/' | '/account';
  children: React.ReactNode;
}

const NAV = [
  { href: '/', label: 'Přehled' },
  { href: '/account', label: 'Účet' },
] as const;

const SOON = ['Objednávky', 'Synchronizace', 'Scraping'];

/**
 * Dashboard frame from design/figma/Dashboard-1.json: a 300px sidebar
 * ("Sidebar Wrapper") next to the content area ("Dashboard v1").
 */
export function DashboardShell({ user, active, children }: Props) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden />
          Dashboard
        </div>

        <nav className={styles.nav} aria-label="Hlavní navigace">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={styles.navItem}
              aria-current={item.href === active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
          <p className={styles.navHeading}>Připravujeme</p>
          {SOON.map((label) => (
            <span key={label} className={`${styles.navItem} ${styles.navSoon}`} aria-disabled>
              {label}
            </span>
          ))}
        </nav>

        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden>
            {user.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <span className={styles.userText}>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </span>
          <form action={signOut}>
            <button type="submit" className={styles.signOut}>
              Odhlásit
            </button>
          </form>
        </div>
      </aside>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
