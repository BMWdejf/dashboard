import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';

import Link from 'next/link';

import { getI18n } from '../../lib/locale';
import { signOut } from '../auth/actions';
import styles from './dashboard.module.css';
import { SectionNav, type NavItem } from './SectionNav';
import section from './section-sidebar.module.css';
import { SidebarFrame } from './SidebarFrame';

interface Props {
  user: { name: string; email: string };
  /** Path of the current page, to open its section in the navigation. */
  active: string;
  /**
   * The page lays out its own padding (as /products does, 32px per the design);
   * otherwise the content gets the standard page padding.
   */
  flush?: boolean;
  children: React.ReactNode;
}

/**
 * Dashboard frame from design/figma/Products.json: a 300px sidebar (logo, menu
 * with the current section opened, quick search, profile and sign-out at the
 * bottom) next to the content; a drawer on small screens. Texts follow the
 * user's language (lib/locale.ts).
 */
export async function DashboardShell({ user, active, flush = false, children }: Props) {
  const { t } = await getI18n();
  const initial = user.name.trim().charAt(0).toUpperCase() || '?';

  // Items without a href have no page yet and show as "soon".
  const items: NavItem[] = [
    { href: '/', label: t.nav.overview },
    {
      href: '/products',
      label: t.nav.products,
      children: [
        { href: '/products', label: t.nav.allProducts },
        { label: t.nav.reports },
        { label: t.nav.importExport },
        { label: t.nav.tasks },
      ],
    },
    { label: t.nav.orders },
    { label: t.nav.sync },
    { label: t.nav.scraping },
    { href: '/integrations', label: t.nav.integrations },
  ];
  const footerItems: NavItem[] = [
    {
      href: '/settings',
      label: t.nav.settings,
      children: [
        { href: '/settings/profile', label: t.settings.tabs.profile },
        { href: '/settings/products', label: t.settings.tabs.products },
      ],
    },
  ];

  return (
    <div className={styles.shell}>
      <SidebarFrame labels={t.shell} className={section.aside}>
        <div className={section.top}>
          <div className={`${section.logoHeader} ${styles.sidebarBrand}`}>
            <span className={section.logoIcon} aria-hidden />
            Dashboard
          </div>
          <SectionNav active={active} labels={t.nav} items={items} footerItems={footerItems} />
        </div>

        <div className={section.bottom}>
          <Link href="/settings/profile" className={section.profile}>
            <span className={section.avatarRing} aria-hidden>
              <span>{initial}</span>
            </span>
            <span className={section.profileText}>
              <strong>{user.name}</strong>
              <span>{t.shell.accountSettings}</span>
            </span>
            <span className={section.chevronRight} aria-hidden />
          </Link>
          <form action={signOut}>
            <button type="submit" className={section.cta}>
              {t.shell.signOut}
              <span className={section.ctaIcon} aria-hidden />
            </button>
          </form>
        </div>
      </SidebarFrame>

      <main className={section.main}>
        {flush ? children : <div className={styles.content}>{children}</div>}
      </main>
    </div>
  );
}
