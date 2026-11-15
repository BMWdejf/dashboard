import { pingDb } from '@repo/core-db';
import { authEnv } from '@repo/core-config';

import AuthLayout from '../auth/layout';
import styles from '../auth/auth.module.css';

export const dynamic = 'force-dynamic';

/** Live status: real checks only, no secrets in the output. */
export default async function StatusPage() {
  const db = await pingDb();
  const auth = authEnv.safeParse(process.env).success;
  const checks = [
    { label: 'Databáze (Neon)', ok: db },
    { label: 'Přihlašování (Neon Auth)', ok: auth },
  ];
  return (
    <AuthLayout>
      <section className={`${styles.card} ${styles.cardSignIn}`}>
        <header className={styles.header}>
          <h1 className={styles.title}>Stav služby</h1>
          <p className={styles.subtitle}>
            {checks.every((c) => c.ok) ? 'Vše funguje.' : 'Některé části nejsou dostupné.'}
          </p>
        </header>
        <ul className={styles.statusList}>
          {checks.map((c) => (
            <li key={c.label}>
              <span>{c.label}</span>
              <strong className={c.ok ? styles.statusOk : styles.statusDown}>
                {c.ok ? 'V pořádku' : 'Nedostupné'}
              </strong>
            </li>
          ))}
        </ul>
      </section>
    </AuthLayout>
  );
}
