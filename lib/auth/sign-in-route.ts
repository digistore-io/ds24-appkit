// Which door an address goes through — the branch behind the two-step sign-in
// dialog on /login.
//
// Pure on purpose, and tested one case at a time (sign-in-route.test.ts). What
// it decides is invisible in a rendered page: three of the four answers look
// identical from step 1, and the one that goes wrong most easily goes wrong
// only where the environment differs from the developer's.

/**
 * `demo`     — sign in immediately, no proof at all (lib/auth/dev-login.ts)
 * `password` — ask for the password (lib/auth/password-login.ts)
 * `link`     — mail a sign-in link (the Auth.js email provider)
 * `none`     — this address has no way in here; say so rather than submit
 */
export type SignInRoute = "demo" | "password" | "link" | "none";

export interface SignInSituation {
  /** Does the ADDRESS have a password? Unknown addresses answer false. */
  hasPassword: boolean;
  /** isDevLoginActive() — the auth bypass, DEV and localhost only. */
  demoLogin: boolean;
  /** isEmailLoginEnabled() — is there a transport to mail a link with? */
  mailConfigured: boolean;
}

/**
 * ⚠️ THE PASSWORD IS ASKED FIRST, and the order of these two lines is the whole
 * point of the function.
 *
 * The obvious shape is `if (demoLogin) return "demo"` as the opening line — it
 * reads well and it is wrong. Demo mode is the state of the *installation*,
 * not of the account, so leading with it means every password ever set on a
 * demo machine stops working, silently, with no message anywhere. That exact
 * regression shipped once before in this file's predecessor and is recorded in
 * the git history of app/login/page.tsx.
 *
 * A password is a thing its owner set on themselves. Nothing about how the
 * server happens to be configured today revokes it.
 */
export function routeForSignIn(situation: SignInSituation): SignInRoute {
  if (situation.hasPassword) return "password";
  if (situation.demoLogin) return "demo";
  if (situation.mailConfigured) return "link";
  // No password, no transport, no bypass. The caller has a sentence for this;
  // the alternative is a form that submits into nothing.
  return "none";
}
