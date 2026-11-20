import { redirect } from 'next/navigation';

import { DashboardShell } from '../dashboard/DashboardShell';
import styles from '../dashboard/dashboard.module.css';
import { getAuth } from '../../lib/auth/server';
import { getI18n } from '../../lib/locale';
import { SettingsTabs } from './SettingsTabs';

// Reads the session from cookies on every request.
export const dynamic = 'force-dynamic';

/** Settings → Profile | Products, inside the dashboard frame. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = await getAuth().getSession();
  // The proxy redirects too, but the layout checks the session itself.
  if (!session?.user) redirect('/auth/sign-in');
  const { t } = await getI18n();

  return (
    <DashboardShell user={session.user} active="/settings">
      <header className={styles.header}>
        <h1 className={styles.title}>{t.settings.title}</h1>
        <p className={styles.subtitle}>{t.settings.subtitle}</p>
      </header>
      <SettingsTabs
        label={t.settings.tabsLabel}
        tabs={[
          { href: '/settings/profile', label: t.settings.tabs.profile },
          { href: '/settings/products', label: t.settings.tabs.products },
        ]}
      />
      {children}
    </DashboardShell>
  );
}
