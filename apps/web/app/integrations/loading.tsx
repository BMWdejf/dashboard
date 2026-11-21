import { getI18n } from '../../lib/locale';
import styles from './integrations.module.css';

/** Shown inside the frame while the sync runs are read. */
export default async function Loading() {
  const { t } = await getI18n();
  return (
    <div className={styles.page} aria-busy="true">
      <header className={styles.top}>
        <h1 className={styles.title}>{t.integrations.title}</h1>
      </header>
      <div className={styles.kpis} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${styles.kpi} ${styles.skeleton}`} />
        ))}
      </div>
      <div className={`${styles.tableCard} ${styles.skeleton} ${styles.skeletonTable}`} aria-hidden />
    </div>
  );
}
