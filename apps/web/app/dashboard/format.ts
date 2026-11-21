import type { Locale } from '@repo/core-db/settings';

import { intlLocale } from '../../lib/i18n';

/**
 * Number and date formats for the user's language: compact numbers as in the
 * design ("50.8K" / "50,8 tis."), the overview's example data in USD, Flexi
 * prices in CZK.
 */
export function formatters(locale: Locale) {
  const l = intlLocale(locale);
  const compact = new Intl.NumberFormat(l, { notation: 'compact', maximumFractionDigits: 1 });
  const whole = new Intl.NumberFormat(l);
  const usd = new Intl.NumberFormat(l, { style: 'currency', currency: 'USD' });
  const usdCompact = new Intl.NumberFormat(l, {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const czk = new Intl.NumberFormat(l, { style: 'currency', currency: 'CZK' });
  const qty = new Intl.NumberFormat(l, { maximumFractionDigits: 3 });
  const signed = new Intl.NumberFormat(l, { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  const date = new Intl.DateTimeFormat(l, {
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  const dateTime = new Intl.DateTimeFormat(l, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Prague',
  });
  return {
    compact: (n: number) => compact.format(n),
    whole: (n: number) => whole.format(n),
    money: (n: number) => usd.format(n),
    moneyCompact: (n: number) => usdCompact.format(n),
    date: (d: Date | null) => (d ? date.format(d) : '—'),
    dateTime: (d: Date | null) => (d ? dateTime.format(d) : '—'),
    /** Trend in percent: "+12,4 %" (cs) / "+12.4%" (en). */
    pct: (n: number) => (locale === 'cs' ? `${signed.format(n)} %` : `${signed.format(n)}%`),
    /** Share without sign: "12,4 %" (cs) / "12.4%" (en). */
    share: (n: number) =>
      locale === 'cs' ? `${qty.format(n)} %` : `${qty.format(n)}%`,
    /** Signed count: "+3". */
    delta: (n: number) => signed.format(n),
    /** CZK price from a decimal string; null → "—". */
    czk: (v: string | null) => (v === null ? '—' : czk.format(Number(v))),
    qty: (v: string) => qty.format(Number(v)),
  };
}

export type Formatters = ReturnType<typeof formatters>;

/** "před 5 minutami" / "5 minutes ago". */
export function relative(at: Date, now: number, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: 'auto',
  });
  const s = Math.round((at.getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
