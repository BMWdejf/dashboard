---
name: auth
description: Login, registration, sessions and access control for this dashboard using Neon Auth (managed Better Auth) with Google OAuth and invite-only access — protecting Next.js pages in apps/web and NestJS endpoints in apps/api, roles, and invitations. Use for any task touching sign-in, users, permissions or protected routes.
---

# Auth: Neon Auth, Google, invite-only

General Neon Auth knowledge (packages, env, Next.js setup, plugin limits) is in
the `neon:neon-auth` skill. Read it, and the live quickstart it links, before
writing auth code. This skill holds **this project's** decisions.

> Status: not implemented yet. The approver escalates every auth change to a
> human.

## Decisions

- **Provider**: Neon Auth (managed Better Auth). Users and sessions live in
  the `neon_auth` schema of our Neon database and branch with it.
- **Sign-in method**: Google OAuth only. No passwords. The shared Google
  credentials are for development only; production needs our own Google OAuth
  app. The redirect is `{NEON_AUTH_BASE_URL}/callback/google`.
- **Who gets in: invite-only.** Anyone can authenticate with Google, but only
  e-mails listed in our `AccessGrant` table (see `db`) get access. Everyone
  else sees "Nemáte přístup, požádejte správce o pozvánku" and nothing else.
  Check whether the installed Neon Auth version can disable open sign-up, and
  use that too, but the `AccessGrant` check stays: it is our source of truth.
- **Roles** (from `AccessGrant.role`):
  - `admin`: manage access grants, run a live Flexi sync (dry-run off), add
    scraper targets.
  - `viewer`: read dashboards, retry failed jobs in dry-run.

## Web (`apps/web`)

Follow the Next.js part of `neon:neon-auth`:

- `lib/auth/server.ts`: `createNeonAuth({ baseUrl: NEON_AUTH_BASE_URL, cookies: { secret: NEON_AUTH_COOKIE_SECRET } })`.
- `app/api/auth/[...path]/route.ts`: `auth.handler()`.
- `proxy.ts` (Next 16): `auth.middleware({ loginUrl: '/auth/sign-in' })`.
  The matcher lists the protected routes; keep `/auth/*`, `/api/auth/*` and
  static assets public.
- Every server component, route handler and server action that reads data
  checks `auth.getSession()` itself. The middleware redirect is not access control.
- The sign-in page has one button: `signIn.social({ provider: 'google', callbackURL })`.

## API (`apps/api`)

- The web server gets a short-lived JWT with `auth.token()` and calls the API
  with `Authorization: Bearer <token>`.
- The API verifies it in a global `AuthGuard`:
  - EdDSA signature against the JWKS (`NEON_AUTH_JWKS_URL`), issuer from
    `NEON_AUTH_BASE_URL`, expiry (15 minutes);
  - then loads the role from `AccessGrant`.
- Mark the few public routes explicitly with `@Public()`: health and Shoptet
  webhooks, which are protected by their signature instead.
- Check roles with `@Roles('admin')` on the endpoints listed under Decisions.
- Sign-out doesn't revoke an issued JWT, so keep tokens short-lived and don't
  cache them server-side.

## Env

`NEON_AUTH_BASE_URL`, `NEON_AUTH_JWKS_URL` (from `neon env pull`) and
`NEON_AUTH_COOKIE_SECRET` (`openssl rand -base64 32`). Add them to
`packages/core/config` as `authEnv`. Each Neon branch has its own Auth URL.
Add every deployed origin as a trusted domain
(`neon neon-auth domain add https://…`); localhost is pre-approved.

## Verify

Sign in, sign out, the session surviving a reload, and a protected page
redirecting. A Google account without a grant is refused. A `viewer` gets 403
on an admin endpoint. A direct API call without a token gets 401. Report any
flow you couldn't verify.

## Never

- Log tokens, cookies or the cookie secret.
- Trust a role or e-mail sent by the browser; read it from the verified token
  and `AccessGrant`.
- Add a new sign-in method, or open registration, without a human decision.
