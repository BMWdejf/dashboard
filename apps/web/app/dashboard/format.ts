// Number formats follow the design ("50.8K", "$240.8K"); dates are Czech.
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-US');
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const date = new Intl.DateTimeFormat('cs-CZ', {
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

export const fmtCompact = (n: number) => compact.format(n);
export const fmtWhole = (n: number) => whole.format(n);
export const fmtMoney = (n: number) => money.format(n);
export const fmtMoneyCompact = (n: number) => `$${compact.format(n)}`;
export const fmtDate = (d: Date | null) => (d ? date.format(d) : '—');
export const fmtPct = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('cs-CZ')} %`;
