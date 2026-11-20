import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

import { readLocaleCookie } from '../lib/locale';
import { readThemeCookie } from '../lib/theme';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Přehled e-shopu, synchronizace a scrapingu',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // dark | light | system, from the user's saved preference (see lib/theme.ts)
  const theme = await readThemeCookie();
  // cs | en, from the user's saved language (see lib/locale.ts)
  const lang = await readLocaleCookie();
  return (
    <html lang={lang} data-theme={theme}>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
