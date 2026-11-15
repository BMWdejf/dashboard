import Link from 'next/link';

import styles from '../auth.module.css';

/** Placeholder until password recovery (design/figma/Recovery.json) is built. */
export default function RecoveryPage() {
  return (
    <section className={`${styles.card} ${styles.cardSignIn}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>Obnova hesla</h1>
        <p className={styles.subtitle}>
          Obnovu hesla připravujeme. Zatím se obraťte na správce dashboardu.
        </p>
      </header>
      <p className={styles.alt}>
        <Link href="/auth/sign-in">Zpět na přihlášení</Link>
      </p>
    </section>
  );
}
