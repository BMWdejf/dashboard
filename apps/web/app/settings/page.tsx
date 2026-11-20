import { redirect } from 'next/navigation';

/** Settings opens on the profile. */
export default function SettingsPage() {
  redirect('/settings/profile');
}
