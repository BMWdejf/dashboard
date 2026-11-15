import { redirect } from 'next/navigation';

import { DashboardShell } from '../dashboard/DashboardShell';
import styles from '../dashboard/dashboard.module.css';
import { getAuth } from '../../lib/auth/server';

// Reads the session from cookies on every request.
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { data: session } = await getAuth().getSession();
  // The proxy redirects too, but the page checks the session itself.
  if (!session?.user) redirect('/auth/sign-in');
  const { user } = session;

  return (
    <DashboardShell user={user} active="/account">
      <header className={styles.header}>
        <h1 className={styles.title}>Váš účet</h1>
        <p className={styles.subtitle}>Údaje, se kterými jste přihlášeni.</p>
      </header>
      <section className={styles.grid}>
        <article className={styles.card}>
          <h2 className={styles.cardTitle}>Jméno</h2>
          <p className={styles.cardText}>{user.name}</p>
        </article>
        <article className={styles.card}>
          <h2 className={styles.cardTitle}>E-mail</h2>
          <p className={styles.cardText}>{user.email}</p>
        </article>
      </section>
    </DashboardShell>
  );
}
