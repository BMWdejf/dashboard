import { redirect } from 'next/navigation';

import { DashboardShell } from './dashboard/DashboardShell';
import styles from './dashboard/dashboard.module.css';
import { getAuth } from '../lib/auth/server';

// Reads the session from cookies on every request.
export const dynamic = 'force-dynamic';

const MODULES = [
  {
    title: 'Objednávky ze Shoptetu',
    text: 'Přehled objednávek a jejich stav synchronizace se objeví po napojení Shoptet API.',
  },
  {
    title: 'Synchronizace do ABRA Flexi',
    text: 'Běhy synchronizace, chyby a převod identifikátorů mezi Shoptetem a Flexi.',
  },
  {
    title: 'Scraping',
    text: 'Sledované weby a nasbíraná data (ceny, dostupnost) z Playwright scraperu.',
  },
];

export default async function DashboardPage() {
  const { data: session } = await getAuth().getSession();
  // The proxy redirects too, but the page checks the session itself.
  if (!session?.user) redirect('/auth/sign-in');
  const { user } = session;

  return (
    <DashboardShell user={user} active="/">
      <header className={styles.header}>
        <h1 className={styles.title}>Vítejte, {user.name}</h1>
        <p className={styles.subtitle}>Přehled vašeho e-shopu a účetnictví.</p>
      </header>
      <section className={styles.grid} aria-label="Moduly">
        {MODULES.map((m) => (
          <article key={m.title} className={styles.card}>
            <h2 className={styles.cardTitle}>{m.title}</h2>
            <p className={styles.cardText}>{m.text}</p>
            <span className={styles.status}>Zatím nenapojeno</span>
          </article>
        ))}
      </section>
    </DashboardShell>
  );
}
