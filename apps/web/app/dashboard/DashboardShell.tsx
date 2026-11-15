import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';

import Link from 'next/link';

import { signOut } from '../auth/actions';
import styles from './dashboard.module.css';
import { NavSearch, type NavItem } from './NavSearch';
import { SidebarFrame } from './SidebarFrame';

interface Props {
  user: { name: string; email: string };
  /** Path of the current page, to highlight it in the navigation. */
  active: '/' | '/account';
  children: React.ReactNode;
}

// The design's menu (Dashboard, Features, Users, Pricing, Integrations,
// Settings, Template pages) mapped to this app; items without a page yet are
// shown as "brzy".
const NAV: NavItem[] = [
  { href: '/', label: 'Přehled' },
  { label: 'Objednávky' },
  { label: 'Synchronizace' },
  { label: 'Scraping' },
  { label: 'Integrace' },
  { href: '/account', label: 'Nastavení' },
];

/**
 * Dashboard frame from design/figma (Dashboard-1, Sidebar Wrapper): a 300px
 * sidebar with search, navigation and the user widget, next to the content.
 */
export function DashboardShell({ user, active, children }: Props) {
  return (
    <div className={styles.shell}>
      <SidebarFrame>
        <div className={`${styles.brand} ${styles.sidebarBrand}`}>
          <span className={styles.logo} aria-hidden />
          Dashboard
        </div>

        <NavSearch items={NAV} active={active} />

        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden>
            {user.name.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <span className={styles.userText}>
            <strong>{user.name}</strong>
            <Link href="/account">Nastavení účtu</Link>
          </span>
          <form action={signOut}>
            <button type="submit" className={styles.signOut}>
              Odhlásit se
            </button>
          </form>
        </div>
      </SidebarFrame>

      <main className={styles.content}>{children}</main>
    </div>
  );
}
