import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';

import Link from 'next/link';

import styles from './auth.module.css';

/** Shared shell of the auth screens: dark canvas, background glows, footer. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <div className={styles.glows} aria-hidden>
          <span className={`${styles.glow} ${styles.glowPink}`} />
          <span className={`${styles.glow} ${styles.glowViolet}`} />
          <span className={`${styles.glow} ${styles.glowCyan}`} />
        </div>
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerStart}>
          <span className={styles.brand}>Dashboard</span>
          <span className={styles.copyright}>
            © {new Date().getFullYear()} Všechna práva vyhrazena.
          </span>
        </div>
        <nav className={styles.footerLinks} aria-label="Právní informace">
          <Link href="/legal/privacy">Ochrana soukromí</Link>
          <Link href="/legal/terms">Obchodní podmínky</Link>
          <Link href="/status">Stav služby</Link>
        </nav>
      </footer>
    </div>
  );
}
