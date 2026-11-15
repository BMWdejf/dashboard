import type { NextRequest } from 'next/server';

import { getAuth } from './lib/auth/server';

/** Redirects signed-out visitors of protected pages to the sign-in page. */
export default function proxy(req: NextRequest) {
  return getAuth().middleware({ loginUrl: '/auth/sign-in' })(req);
}

export const config = {
  // Only protected pages. Keep /auth/*, /api/auth/* and static assets public.
  matcher: ['/account/:path*'],
};
