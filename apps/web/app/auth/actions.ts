'use server';

import { redirect } from 'next/navigation';

import { getAuth } from '../../lib/auth/server';

export type AuthFormState = { error?: string } | undefined;

const field = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export async function signUp(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const name = field(form, 'name');
  const email = field(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!name || !email || password.length < 8) {
    return { error: 'Vyplňte jméno, e-mail a heslo (alespoň 8 znaků).' };
  }
  const { error } = await getAuth().signUp.email({ name, email, password });
  if (error) return { error: error.message ?? 'Registrace se nezdařila.' };
  redirect('/account');
}

export async function signIn(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = field(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Vyplňte e-mail a heslo.' };
  const { error } = await getAuth().signIn.email({ email, password });
  if (error) return { error: 'Nesprávný e-mail nebo heslo.' };
  redirect('/account');
}

export async function signOut(): Promise<void> {
  await getAuth().signOut();
  redirect('/auth/sign-in');
}
