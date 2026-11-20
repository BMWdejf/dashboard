import { getUserPreferences, LOCALES, PRICE_MODES, THEMES } from '@repo/core-db';
import { redirect } from 'next/navigation';

import styles from '../../dashboard/dashboard.module.css';
import { getAuth } from '../../../lib/auth/server';
import { getI18n } from '../../../lib/locale';
import { readThemeCookie } from '../../../lib/theme';
import { ChoiceSetting } from '../ChoiceSetting';

export default async function ProfileSettingsPage() {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) redirect('/auth/sign-in');
  const { user } = session;
  const { locale, t } = await getI18n();
  const p = t.settings.profile;

  // Saved preferences from Neon; if the DB is down, fall back to the cookies
  // and defaults so the page still renders.
  const prefs = await getUserPreferences(user.id).catch(async () => ({
    theme: await readThemeCookie(),
    language: locale,
    priceMode: 'withVat' as const,
  }));

  return (
    <div className={styles.stack}>
      <section className={styles.grid} aria-label={t.settings.tabs.profile}>
        <article className={styles.card}>
          <h2 className={styles.cardTitle}>{p.name}</h2>
          <p className={styles.cardValue}>{user.name}</p>
        </article>
        <article className={styles.card}>
          <h2 className={styles.cardTitle}>{p.email}</h2>
          <p className={styles.cardValue}>{user.email}</p>
        </article>
      </section>

      <section className={styles.card} aria-label={p.appearance}>
        <ChoiceSetting
          kind="theme"
          legend={p.appearance}
          initial={prefs.theme}
          labels={t.common}
          options={THEMES.map((v) => ({ value: v, label: p.themes[v].label, hint: p.themes[v].hint }))}
        />
      </section>

      <section className={styles.card} aria-label={p.language}>
        <ChoiceSetting
          kind="language"
          legend={p.language}
          hint={p.languageHint}
          initial={prefs.language}
          labels={t.common}
          options={LOCALES.map((v) => ({ value: v, label: p.languages[v] }))}
        />
      </section>

      <section className={styles.card} aria-label={p.price}>
        <ChoiceSetting
          kind="priceMode"
          legend={p.price}
          hint={p.priceHint}
          initial={prefs.priceMode}
          labels={t.common}
          options={PRICE_MODES.map((v) => ({ value: v, label: p.priceModes[v] }))}
        />
      </section>
    </div>
  );
}
