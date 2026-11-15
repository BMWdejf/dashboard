import { pingDb } from '@repo/core-db';

import styles from '../auth.module.css';
import { SignInForm } from '../SignInForm';

// The first tile shows the live database status.
export const dynamic = 'force-dynamic';

export default async function SignInPage() {
  const dbOnline = await pingDb();
  // The design's three tiles under the card, with facts about this app.
  const tiles = [
    { value: dbOnline ? 'Online' : 'Offline', label: 'Stav databáze', ok: dbOnline },
    { value: 'HTTPS', label: 'Šifrovaný přenos', ok: true },
    { value: 'Neon Auth', label: 'Správa účtů', ok: true },
  ];
  return (
    <div className={styles.signInPage}>
      <SignInForm />
      <ul className={styles.tiles} aria-label="Stav a zabezpečení">
        {tiles.map((t) => (
          <li key={t.label} className={styles.tile}>
            <strong className={t.ok ? undefined : styles.tileDown}>{t.value}</strong>
            <span>{t.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
