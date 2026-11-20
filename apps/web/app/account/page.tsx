import { permanentRedirect } from 'next/navigation';

/** The old account page moved to Settings → Profile. */
export default function AccountPage() {
  permanentRedirect('/settings/profile');
}
