#!/usr/bin/env node
// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// A signed-in session for the local app, from a script — so `smoke` can call the
// pages behind the sign-in instead of collecting redirects.
//
// The hole it closes: every page under /dashboard answers an anonymous request
// with a 307 to /login, which is the correct answer and says nothing about the
// page. So exactly the pages with the real queries in them — the operator's, the
// member's, the ones touching money and roles — were only ever exercised when a
// person opened them by hand. See CLAUDE.md → "Never ship a broken page".
//
// Three rules held it to `fetch` and nothing else:
//
//  1. **Never hardcode a cookie name.** In DEV the names carry a fingerprint of
//     AUTH_SECRET (lib/auth/cookie-names.ts), so two apps on one machine do not
//     overwrite each other's session. The jar below therefore stores whatever
//     `Set-Cookie` arrives and hands it back — it never needs to know a name.
//  2. **Never re-derive whether the development login is allowed.** Four
//     conditions decide that, they are security-critical, and they live in ONE
//     place (lib/auth/dev-login.ts → isDevLoginAllowed). A copy of them here
//     would be a copy that drifts. So we ask the app instead: /api/auth/providers
//     lists what is actually configured. Ask the thing, not the config.
//  3. **Skipping is said out loud, never assumed silently.** Every way out of
//     here returns a reason, and smoke prints it. A sweep that quietly stopped
//     being signed in would report green while checking nothing.
//
// This is DEV-only by construction: without the development login there is no way
// in from a script, and that provider does not exist outside development.
import postgres from "postgres";
import "../lib/env.mjs";

/**
 * A cookie jar that knows no cookie names.
 *
 * Deliberately crude — it keeps the last value per name and never looks at Path,
 * Domain or Expires. Everything here talks to one local origin inside one second,
 * so the parts of the spec it ignores cannot come up. What it must get right is
 * the one thing it does: give back exactly what the app set.
 */
export function cookieJar() {
  const jar = new Map();
  return {
    take(response) {
      // getSetCookie() keeps multiple Set-Cookie headers apart; a plain get()
      // joins them with a comma and Expires dates contain commas.
      const headers = response.headers.getSetCookie?.() ?? [];
      for (const header of headers) {
        const [pair] = header.split(";");
        const eq = pair.indexOf("=");
        if (eq < 1) continue;
        jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    },
    get header() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    get size() {
      return jar.size;
    },
  };
}

/** Is the development login among the providers this app actually offers? */
async function devLoginOffered(baseUrl) {
  const answer = await fetch(`${baseUrl}/api/auth/providers`, { redirect: "manual" });
  if (!answer.ok) return false;
  const providers = await answer.json();
  return Boolean(providers?.["dev-login"]);
}

/**
 * The oldest owner's address — the account the operator made for themselves.
 *
 * The same order as demoLoginSuggestion() in lib/auth/dev-login.ts, and for the
 * same reason. Owners only: signing in as a member would collect a legitimate
 * redirect on every admin page and prove nothing about it.
 *
 * No account is created here. An app with no owner yet gets a named skip and a
 * command to fix it — inventing a user would put a row somebody did not ask for
 * into their database, on a command they ran to look at pages.
 */
async function oldestOwner() {
  if (!process.env.DATABASE_URL) return { error: "DATABASE_URL is not set" };
  const sql = postgres(process.env.DATABASE_URL, { max: 1, idle_timeout: 2, connect_timeout: 5 });
  try {
    // The column names are quoted because db/schema.ts declares them camelCase
    // ("createdAt", not created_at) — unquoted, Postgres would fold them to
    // lower case and not find them.
    const rows = await sql`
      select email from users
      where role = 'owner' and "blockedAt" is null
      order by "createdAt" asc
      limit 1
    `;
    if (rows.length === 0) {
      return { error: "no owner account yet — create one: node run.mjs user-create --email … --role owner --apply" };
    }
    return { email: rows[0].email };
  } catch (error) {
    return { error: `the database did not answer (${error.message.split("\n")[0]})` };
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}

/**
 * Sign in as the app's owner and return the cookies that prove it.
 *
 * @returns {Promise<{cookie: string, as: string} | {skipped: true, reason: string}>}
 */
export async function signInAsOwner(baseUrl) {
  const skip = (reason) => ({ skipped: true, reason });

  try {
    if (!(await devLoginOffered(baseUrl))) {
      return skip(
        "the development login is not active — mail delivery is configured, APP_URL is not local, " +
          "or DEV_LOGIN=off (lib/auth/dev-login.ts)",
      );
    }
  } catch (error) {
    return skip(`the app did not answer on /api/auth/providers (${error.message})`);
  }

  const owner = await oldestOwner();
  if (owner.error) return skip(owner.error);

  const jar = cookieJar();

  // Auth.js pairs a CSRF cookie with a token in the body; both have to travel.
  const csrfAnswer = await fetch(`${baseUrl}/api/auth/csrf`, { redirect: "manual" });
  jar.take(csrfAnswer);
  const { csrfToken } = await csrfAnswer.json().catch(() => ({}));
  if (!csrfToken) return skip("no CSRF token from /api/auth/csrf");

  // `json=true` asks Auth.js for a JSON answer instead of a redirect, which is
  // the shape a script can read. The session cookie rides on the response either
  // way — that is what we are here for.
  const login = await fetch(`${baseUrl}/api/auth/callback/dev-login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header },
    body: new URLSearchParams({ csrfToken, email: owner.email, json: "true" }).toString(),
  });
  jar.take(login);

  // A refused sign-in still answers 200 with a URL carrying ?error= — so the
  // status code is not the test. Whether we hold more cookies than the CSRF one
  // we arrived with is.
  const location = login.headers.get("location") ?? "";
  const body = await login.text().catch(() => "");
  if (/[?&]error=/.test(location) || /[?&]error=/.test(body)) {
    return skip(`the development login refused ${owner.email}`);
  }
  if (jar.size < 2) return skip("no session cookie came back from the sign-in");

  return { cookie: jar.header, as: owner.email };
}
