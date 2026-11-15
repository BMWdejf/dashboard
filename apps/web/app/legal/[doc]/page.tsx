import { notFound } from 'next/navigation';

import AuthLayout from '../../auth/layout';
import styles from '../../auth/auth.module.css';

const DOCS = {
  terms: 'Obchodní podmínky',
  privacy: 'Zásady ochrany soukromí',
} as const;

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

/** Placeholder until the real legal texts exist; it says so plainly. */
export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  const title = DOCS[doc as keyof typeof DOCS];
  if (!title) notFound();
  return (
    <AuthLayout>
      <section className={`${styles.card} ${styles.cardSignIn}`}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>Text dokumentu se připravuje.</p>
        </header>
      </section>
    </AuthLayout>
  );
}
