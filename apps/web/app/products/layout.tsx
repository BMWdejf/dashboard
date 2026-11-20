import { redirect } from 'next/navigation';

import { DashboardShell } from '../dashboard/DashboardShell';
import { getAuth } from '../../lib/auth/server';

// Reads the session from cookies on every request.
export const dynamic = 'force-dynamic';

/** Dashboard frame around /products, so loading.tsx shows inside it. */
export default async function ProductsLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = await getAuth().getSession();
  // The proxy redirects too, but the layout checks the session itself.
  if (!session?.user) redirect('/auth/sign-in');
  return (
    <DashboardShell user={session.user} active="/products" flush>
      {children}
    </DashboardShell>
  );
}
