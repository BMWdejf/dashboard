import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getI18n } from '../../../../lib/locale';
import type { ConnectionKind } from '../actions';
import { ConnectionForm } from '../ConnectionForm';
import { FeedWizard } from '../FeedWizard';
import styles from '../new.module.css';

const KINDS: ConnectionKind[] = ['flexi', 'shoptet', 'feed'];

/**
 * Configuration pages from design/figma/Configuration Flexibe Data REST API
 * integration.json and Configuration XML feed Data integration.json; Shoptet
 * follows the REST API layout (no frame of its own). The feed continues to
 * mapping and schedule steps (FeedWizard, Configure XML Feed Mapping.json).
 */
export default async function ConnectionPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: raw } = await params;
  const kind = KINDS.find((k) => k === raw);
  if (!kind) notFound();
  const { t } = await getI18n();
  const tn = t.integrationsNew;

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label={tn.breadcrumbRoot}>
        <Link href="/integrations">{tn.breadcrumbRoot}</Link>
        <span aria-hidden>/</span>
        <Link href="/integrations/new">{tn.breadcrumb}</Link>
      </nav>
      {kind === 'feed' ? <FeedWizard t={tn} /> : <ConnectionForm kind={kind} t={tn} />}
    </div>
  );
}
