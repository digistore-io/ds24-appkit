// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Route protection in front of the app — up to Next.js 15 this file was called
// `middleware.ts`; since 16 the convention is `proxy.ts`.
//
// It uses ONLY the edge-safe auth.config (no database import). Since Next 16
// the proxy runs in the Node runtime, so that is no longer a hard requirement
// — but it stays that way on purpose: auth.config.ts is shared with the real
// auth.ts, and a Postgres import here would put the whole database layer in
// front of every request.
//
// What it can and cannot do is unchanged: it sees the JWT, not the database. A
// blocked user therefore stays signed in until `requireActiveUser()` in
// app/dashboard/layout.tsx throws them out — see lib/users/blocked.ts.
//
// ⚠️ THE MATCHER SAYS WHERE THIS RUNS. IT DOES NOT SAY WHAT IS PROTECTED.
// The refusal is `authorized()` in auth.config.ts, and it returns true for
// every path outside `/dashboard`. So a path listed below is not protected by
// being listed — it is protected by that callback. The two used to be the same
// list, and they stopped being one when this file also got a second job (below).
import NextAuth from "next-auth";
import {
  NextResponse,
  type NextFetchEvent,
  type NextMiddleware,
  type NextRequest,
} from "next/server";
import authConfig from "@/auth.config";
import { staleAuthCookieNames } from "@/lib/auth/cookie-names";

// Deliberately in two steps: Next.js reads this export statically, and a
// destructured `export const { auth: proxy } = …` is not recognized as a
// function — the build then fails with "must export a function".
const { auth } = NextAuth(authConfig);

/**
 * `auth` as the middleware it is — called by us instead of exported directly,
 * so that the answer can be amended before it leaves (see `pruneStaleCookies`).
 *
 * ⚠️ THE CAST IS NECESSARY AND THE ALTERNATIVE IS A SECURITY BUG. Auth.js types
 * `auth` for four uses and the inline-middleware one is not among them — it is
 * dispatched at runtime on `args[0] instanceof Request` (next-auth/lib/index.js),
 * because the documented way to reach it is `export default auth`, where Next's
 * own types accept the function unexamined.
 *
 * The typed alternative — `auth(async (req) => …)` — compiles and quietly
 * removes the route protection: in that shape `handleAuth` runs the user's
 * handler INSTEAD of the branch that redirects an unauthorized request
 * (`else if (userMiddlewareOrRoute)` sits before `else if (!authorized)`). The
 * `authorized()` callback is still called, and its answer is then discarded.
 * Every page under /dashboard would be reachable without a session.
 */
const guarded = auth as unknown as NextMiddleware;

/**
 * The second job: throwing out the session cookies of OTHER local copies of
 * this template, once there are enough of them to break the machine.
 *
 * Cookies know nothing about ports, so every copy ever started on this machine
 * sends its session to every other one. Past Node's 16 KB header limit the
 * request is answered `431` by the HTTP parser — **before Next.js sees it**,
 * which is why the dev log shows the GET of a page and then no POST at all, and
 * why the browser reports "An unexpected response was received from the server."
 * on the sign-in page of the app that is least at fault: the newest one.
 *
 * What is deleted, and when, is `staleAuthCookieNames()` — DEV only, localhost
 * only, and only above a threshold, so two apps worked on side by side keep
 * both sessions. Everything load-bearing about the decision is documented
 * there; this function only carries it out.
 *
 * It has to happen HERE because it has to happen on a GET: a server component
 * may not set a cookie, and by the time an action POST is refused with 431
 * there is no request left to answer. That is also why the matcher below covers
 * the two pages somebody lands on while signed out.
 */
function pruneStaleCookies(request: NextRequest, response: Response): Response {
  const stale = staleAuthCookieNames(request.cookies.getAll(), {
    APP_ENV: process.env.APP_ENV,
    APP_URL: process.env.APP_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
  });
  if (stale.length === 0) return response;

  // A redirect built by `Response.redirect()` has immutable headers, so the
  // deletions go onto a copy rather than onto the answer we were handed.
  const patched = new NextResponse(response.body, response);
  for (const name of stale) patched.cookies.delete(name);
  return patched;
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = (await guarded(request, event)) ?? NextResponse.next();
  return pruneStaleCookies(request, response);
}

export const config = {
  // Two different reasons to be in this list, and they must not be confused —
  // see the warning at the top of the file.
  //
  //   /dashboard/:path*  is PROTECTED (authorized() refuses without a session)
  //   /login, /          are only VISITED — the proxy runs there to clean up
  //                      the cookies of other local copies, and protects
  //                      nothing. Both stay public.
  //
  // Everything NOT matched here is public AND unswept. Add a new protected area
  // here *and* teach authorized() about it.
  // Staying public by design: home page, login, auth routes, /plans, opt-in,
  // IPN webhook.
  matcher: ["/dashboard/:path*", "/login", "/"],
};
