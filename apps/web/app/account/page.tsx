import { redirect } from 'next/navigation';

import { signOut } from '../auth/actions';
import AuthLayout from '../auth/layout';
import styles from '../auth/auth.module.css';
import { getAuth } from '../../lib/auth/server';

// Reads the session from cookies on every request.
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { data: session } = await getAuth().getSession();
  // The proxy redirects too, but the page checks the session itself.
  if (!session?.user) redirect('/auth/sign-in');
  const { user } = session;

  return (
    <AuthLayout>
      <section className={`${styles.card} ${styles.cardSignIn}`}>
        <header className={styles.header}>
          <span className={styles.badge}>Účet</span>
          <h1 className={styles.title}>Váš účet</h1>
        </header>
        <p className={styles.account}>
          Přihlášen jako <strong>{user.name}</strong> ({user.email})
        </p>
        <form action={signOut}>
          <button type="submit" className={styles.submit}>
            Odhlásit se
          </button>
        </form>
      </section>
    </AuthLayout>
  );
}
