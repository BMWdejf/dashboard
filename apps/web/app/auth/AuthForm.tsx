'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import type { AuthFormState } from './actions';
import styles from './auth.module.css';

interface Props {
  mode: 'sign-up' | 'sign-in';
  action: (prev: AuthFormState, form: FormData) => Promise<AuthFormState>;
}

const copy = {
  'sign-up': {
    badge: 'Nový účet',
    title: 'Vytvořte si účet',
    subtitle: 'Zaregistrujte se a získejte přístup k dashboardu.',
    submit: 'Zaregistrovat se',
    altText: 'Už máte účet? ',
    altLink: 'Přihlaste se',
    altHref: '/auth/sign-in',
  },
  'sign-in': {
    badge: 'Dashboard',
    title: 'Vítejte zpět',
    subtitle: 'Přihlaste se e-mailem a heslem.',
    submit: 'Přihlásit se',
    altText: 'Nemáte účet? ',
    altLink: 'Zaregistrujte se',
    altHref: '/auth/sign-up',
  },
} as const;

export function AuthForm({ mode, action }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const signUp = mode === 'sign-up';
  const t = copy[mode];

  return (
    <section className={`${styles.card} ${signUp ? styles.cardSignUp : styles.cardSignIn}`}>
      <header className={styles.header}>
        <span className={styles.badge}>{t.badge}</span>
        <h1 className={styles.title}>{t.title}</h1>
        <p className={styles.subtitle}>{t.subtitle}</p>
      </header>

      {!signUp && <div className={styles.divider} />}

      <form action={formAction} className={styles.form}>
        {signUp && (
          <label className={styles.field}>
            Jméno
            <input name="name" autoComplete="name" placeholder="Jan Novák" required />
          </label>
        )}
        <label className={styles.field}>
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="jan@firma.cz"
            required
          />
        </label>
        <label className={styles.field}>
          Heslo
          <input
            name="password"
            type="password"
            autoComplete={signUp ? 'new-password' : 'current-password'}
            minLength={signUp ? 8 : undefined}
            placeholder="••••••••"
            required
          />
          {signUp && <span className={styles.hint}>Alespoň 8 znaků.</span>}
        </label>
        {state?.error && (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        )}
        <button type="submit" className={styles.submit} disabled={pending}>
          {pending ? 'Čekejte…' : t.submit}
        </button>
      </form>

      <p className={styles.alt}>
        {t.altText}
        <Link href={t.altHref}>{t.altLink}</Link>
      </p>
    </section>
  );
}
