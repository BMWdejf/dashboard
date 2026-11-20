import { DEFAULT_PRODUCT_SETTINGS, getUserPreferences } from '@repo/core-db';
import { redirect } from 'next/navigation';

import { getAuth } from '../../../lib/auth/server';
import { getI18n } from '../../../lib/locale';
import { ProductSettingsForm } from './ProductSettingsForm';

export default async function ProductSettingsPage() {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) redirect('/auth/sign-in');
  const { t } = await getI18n();

  const settings = await getUserPreferences(session.user.id)
    .then((p) => p.productSettings)
    .catch((e) => {
      console.error('settings/products: loading failed', e instanceof Error ? e.message : e);
      return DEFAULT_PRODUCT_SETTINGS;
    });

  return <ProductSettingsForm initial={settings} t={t.settings.products} labels={t.common} />;
}
