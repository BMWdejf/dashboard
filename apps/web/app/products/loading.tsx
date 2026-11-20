import { getI18n } from '../../lib/locale';
import styles from './products.module.css';

/** Shown inside the frame while the mirror is queried. */
export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div aria-busy="true">
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>{t.products.title}</h1>
      </header>
      <div className={styles.body} aria-hidden>
        <div className={styles.kpis}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${styles.kpi} ${styles.skeleton}`} />
          ))}
        </div>
        <div className={`${styles.tableCard} ${styles.skeletonTable}`} />
      </div>
    </div>
  );
}
