import { getUserTheme } from '@repo/core-db';
import { redirect } from 'next/navigation';

import { DashboardShell } from '../dashboard/DashboardShell';
import styles from '../dashboard/dashboard.module.css';
import { getAuth } from '../../lib/auth/server';
import { readThemeCookie } from '../../lib/theme';
import { ThemePicker } from './ThemePicker';

// Reads the session from cookies on every request.
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { data: session } = await getAuth().getSession();
  // The proxy redirects too, but the page checks the session itself.
  if (!session?.user) redirect('/auth/sign-in');
  const { user } = session;

  // Saved preference from Neon; fall back to the cookie if the DB is down.
  const theme = await getUserTheme(user.id).catch(() => readThemeCookie());

  return (
    <DashboardShell user={user} active="/account">
      <header className={styles.header}>
        <h1 className={styles.title}>Nastavení účtu</h1>
        <p className={styles.subtitle}>Váš profil a vzhled dashboardu. Změny se ukládají samy.</p>
      </header>
      <div className={styles.stack}>
        <section className={styles.grid} aria-label="Profil">
          <article className={styles.card}>
            <h2 className={styles.cardTitle}>Jméno</h2>
            <p className={styles.cardValue}>{user.name}</p>
          </article>
          <article className={styles.card}>
            <h2 className={styles.cardTitle}>E-mail</h2>
            <p className={styles.cardValue}>{user.email}</p>
          </article>
        </section>
        <section className={styles.card} aria-label="Vzhled">
          <ThemePicker initial={theme} />
        </section>
      </div>
    </DashboardShell>
  );
}
