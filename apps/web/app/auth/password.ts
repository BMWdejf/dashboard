export type Strength = 0 | 1 | 2 | 3;

export const STRENGTH_LABEL: Record<Strength, string> = {
  0: '—',
  1: 'Slabé',
  2: 'Střední',
  3: 'Silné',
};

/**
 * Rough password strength for the sign-up hint: length plus the number of
 * character classes. A hint only; the server enforces the real rules.
 */
export function passwordStrength(password: string): Strength {
  if (!password) return 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (password.length < 8 || classes < 2) return 1;
  if (password.length >= 12 && classes >= 3) return 3;
  return 2;
}
