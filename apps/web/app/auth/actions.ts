'use server';

import { redirect } from 'next/navigation';

import { getUserTheme } from '@repo/core-db';

import { getAuth } from '../../lib/auth/server';
import { writeThemeCookie } from '../../lib/theme';

export type AuthFormState = { error?: string } | undefined;

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/** Better Auth error codes that are safe to show: they don't depend on the e-mail. */
const SIGN_UP_ERRORS: Record<string, string> = {
  PASSWORD_TOO_SHORT: 'Heslo je příliš krátké.',
  PASSWORD_TOO_LONG: 'Heslo je příliš dlouhé.',
  INVALID_EMAIL: 'Zadejte platný e-mail.',
};

export async function signUp(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const name = field(form, 'name');
  const email = field(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!name || !email || password.length < 8) {
    return { error: 'Vyplňte jméno, e-mail a heslo (alespoň 8 znaků).' };
  }
  if (form.get('terms') !== 'on') {
    return { error: 'Pro registraci je potřeba souhlasit s podmínkami.' };
  }
  const { error } = await getAuth().signUp.email({ name, email, password });
  if (error) {
    // Upstream messages such as "user already exists" would reveal who has an
    // account. Show only password-policy errors, which say nothing about the
    // e-mail; log the code (never the e-mail) on the server.
    console.warn('sign-up failed', { status: error.status, code: error.code });
    return { error: SIGN_UP_ERRORS[error.code ?? ''] ?? 'Registrace se nezdařila. Zkuste to znovu, nebo se přihlaste.' };
  }
  redirect('/');
}

export async function signIn(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = field(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Vyplňte e-mail a heslo.' };
  const { data, error } = await getAuth().signIn.email({ email, password });
  if (error) return { error: 'Nesprávný e-mail nebo heslo.' };
  // Bring the user's saved theme to this browser. Not fatal if the DB is down.
  const userId = data?.user?.id;
  if (userId) {
    try {
      await writeThemeCookie(await getUserTheme(userId));
    } catch (e) {
      console.warn('sign-in: loading theme failed', e instanceof Error ? e.message : e);
    }
  }
  redirect('/');
}

export async function signOut(): Promise<void> {
  await getAuth().signOut();
  redirect('/auth/sign-in');
}
