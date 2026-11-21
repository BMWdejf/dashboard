import Link from 'next/link';

import { getI18n } from '../../../lib/locale';
import styles from './new.module.css';

const KINDS = ['flexi', 'shoptet', 'feed'] as const;

/** "Přidat integraci": choose REST API (ABRA Flexi), Shop (Shoptet) or XML feed. */
export default async function NewIntegrationPage() {
  const { t } = await getI18n();
  const tn = t.integrationsNew;
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <nav className={styles.breadcrumb} aria-label={tn.breadcrumbRoot}>
          <Link href="/integrations">{tn.breadcrumbRoot}</Link>
          <span aria-hidden>/</span>
          <span aria-current="page">{tn.breadcrumb}</span>
        </nav>
        <h1 className={styles.title}>{tn.chooser.title}</h1>
        <p className={styles.subtitle}>{tn.chooser.subtitle}</p>
      </header>

      <ul className={styles.tiles} aria-label={tn.chooser.group}>
        {KINDS.map((k) => {
          const c = tn.chooser[k];
          return (
            <li key={k}>
              <Link href={`/integrations/new/${k}`} className={`${styles.tile} ${styles[`tone_${k}`]}`}>
                <span className={styles.tileIcon} aria-hidden>
                  {k === 'flexi' ? 'API' : k === 'shoptet' ? 'SHOP' : 'XML'}
                </span>
                <span className={styles.tileKind}>{c.title}</span>
                <span className={styles.tileName}>{c.name}</span>
                <span className={styles.tileText}>{c.text}</span>
                <span className={styles.tileMeta}>{c.meta}</span>
                <span className={styles.tileCta}>
                  {tn.chooser.choose}
                  <span className={styles.arrow} aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
