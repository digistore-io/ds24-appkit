// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Coins, CreditCard, KeyRound } from "lucide-react";

import { auth } from "@/auth";
import { entitlementsFor, suspendedKeysFor } from "@/lib/entitlements/manage";
import { pausedKeys } from "@/lib/entitlements/rules";
import { getProduct } from "@/lib/digistore/products";
import { getTokenAccount } from "@/lib/tokens/account";
import { sellsPlans, sellsTokens } from "@/lib/billing-mode";
import { signInState } from "@/lib/credentials/manage";
import { MIN_PASSWORD_LENGTH } from "@/lib/credentials/rules";
import { pendingChangeFor } from "@/lib/email-change/manage";
import { isEmailLoginEnabled } from "@/lib/email";
import { mcpConfig, mcpOffReason } from "@/lib/mcp/config";
import { countLiveKeys, listKeys } from "@/lib/mcp/keys";
import { MAX_LIVE_KEYS } from "@/lib/mcp/rules";
import { consentStatusFor } from "@/lib/consent/manage";
import { countOwners } from "@/lib/users/manage";
import { SignInCard } from "./ui";
import { McpCard } from "./mcp-ui";
import { ConsentCard, DeleteAccountCard, MyDataCard } from "./privacy-ui";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export async function generateMetadata() {
  const t = await getTranslations("account");
  return { title: t("title") };
}

/**
 * How `accessUntil` is rendered — for `getFormatter().dateTime(...)`, never for
 * `toLocaleDateString`, so the language comes from the request (cookie /
 * browser) and not from the server's environment.
 *
 * ⛔ `timeZone: "UTC"` is LOAD-BEARING, not decoration, and it is the third
 * place in this repo that has had to say so. `access_until` is a `timestamp`
 * WITHOUT time zone holding the LAST MILLISECOND of the day the Operator picked,
 * in UTC (db/index.ts pins OID 1114 to UTC in both directions). Rendered in the
 * viewer's zone, a grant issued "through 1 August" reads **2 August** for
 * everybody ahead of UTC — and on New Year's Eve it is off by a day AND a year.
 * The Operator's own page (app/dashboard/admin/users/[id]/ui.tsx) and story
 * 3.3's confirmation toast both pin it for exactly this reason; a Member told a
 * different day from the Operator who helped them is the whole failure this
 * story exists to prevent.
 */
const ACCESS_UNTIL_FORMAT = { dateStyle: "long", timeZone: "UTC" } as const;

/**
 * What the registry calls this plan, or the raw key when it cannot say.
 *
 * `getProduct` THROWS on a key the registry does not know, and by design:
 * `entitlementsFor` returns what is STORED and never consults the registry, so
 * a key the operator removed from config/digistore-products.json still turns up
 * here (docs/entitlements.md says so in as many words). Letting that throw would
 * 500 the account page of every customer holding a retired plan — and it would
 * also put the registry's hard-coded GERMAN error text ("Unbekanntes Produkt")
 * in front of an English Member. Same shape, same reasoning, as `safeProduct()`
 * in lib/digistore/payment-event.ts and `safeProductKind()` in
 * lib/entitlements/manage.ts.
 *
 * The KEY is the fallback rather than a placeholder: it is what support and the
 * Digistore24 receipt call this plan, so it is the one string worth quoting.
 * Product names are deliberately NOT translated — that is the seller's own
 * copy, and Digistore24 holds the same text.
 */
function planName(productKey: string): string {
  try {
    return getProduct(productKey).name;
  } catch {
    return productKey;
  }
}

/**
 * The absolute URL a client is told to connect to.
 *
 * `APP_URL` first because it is the deliberate answer — it is what the operator
 * configured and what every other outbound URL in this app uses. The request's
 * own origin is the fallback for a local machine where the app moved to another
 * port before `.env` caught up. Same shape as `appOrigin()` in actions.ts.
 *
 * This string is copied into a config file on somebody's laptop, so getting it
 * wrong costs them a debugging session rather than a page refresh.
 */
async function mcpEndpoint(): Promise<string> {
  const configured = process.env.APP_URL?.trim();
  if (configured) return `${configured.replace(/\/+$/, "")}/api/mcp`;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}/api/mcp`;
}

// The Member's own account page: what they may use, until when, and what
// balance they hold. The counterpart of the Operator's
// /dashboard/admin/users/[id] — and deliberately NOT built from its readers.
//
// ⛔ NOTHING HERE RENDERS `note` OR `issuedBy` (story 3.5 AC 5, §D5).
// `grants.note` and `tokenLedger.note` hold the OPERATOR's words about this
// customer — "comped, angry on the phone" — written for a support colleague and
// never for the person they describe. This page therefore reads
// `entitlementsFor` / `suspendedKeysFor` (Product Keys and dates, nothing else)
// and never `listGrantsFor` / `listLedgerFor`, which carry both. The rule is
// structural, not a promise: there is no shape here that HAS a note on it, so
// there is nothing a careless spread could leak. lib/entitlements/leak-guard.test.ts
// asserts it.
//
// NO `revalidate` AND NO `unstable_cache`, deliberately. The page calls `auth()`
// and is dynamic for free, which is what makes AC 1 ("next page load") true —
// and AD-8 forbids caching an entitlement answer at all, because a stored yes
// survives the chargeback that should have revoked it.
//
// A STATIC route (no `[param]` segment), so `node run.mjs smoke` calls it on every run.
export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const memberId = session.user.id;

  const [entitlements, suspended, account, credentials, pendingChange] =
    await Promise.all([
    entitlementsFor(memberId),
    // AC 4 — the case the ACs of Epic 2 forgot. `activeFor` filters a suspended
    // grant out ENTIRELY, so without this read a customer whose card expired
    // over a weekend sees an empty list and no explanation: the exact failure
    // docs/entitlements.md warns against.
    suspendedKeysFor(memberId),
    // May be undefined — a Member who never bought tokens HAS no account row.
    // Read as `?? 0`; creating one because somebody looked at their own page
    // would write a row on every visit.
    getTokenAccount(memberId),
    // The address and whether a password is set — a boolean, never the hash.
    // There is no shape here that HAS the hash on it, which is the same
    // structural argument the note/issuedBy comment above makes: nothing
    // careless can leak what was never fetched.
    signInState(memberId),
    // A requested-but-unconfirmed address change, or null. Expired ones read as
    // null — telling somebody to keep waiting for a dead link is worse than
    // saying nothing.
    pendingChangeFor(memberId),
  ]);

  // The MCP keys. Read unconditionally — a Member who holds keys from before
  // the Operator switched the interface off still has to be able to see and
  // revoke them, which is the same rule the balance card follows: a display
  // switch may hide an EMPTY thing, never a non-empty one.
  const mcpOff = mcpOffReason();
  const [mcpKeyRows, liveKeyCount] = await Promise.all([
    listKeys(memberId),
    countLiveKeys(memberId),
  ]);

  // Suspended AND not covered by something else the Member can still use. A key
  // held through a failed subscription plus an Operator's comp is not paused,
  // and saying so beside the same plan listed as available is a contradiction
  // the Member cannot resolve. Pure, and tested — lib/entitlements/rules.ts.
  const paused = pausedKeys(entitlements, suspended);

  // The balance card, unless this app sells no tokens AND this Member holds
  // none. The second half is not belt-and-braces: `billingMode` is a display
  // setting somebody flips on a live app, and hiding a balance that was paid
  // for turns a layout change into a support case. See lib/billing-mode.ts.
  const balance = account?.balance ?? 0;
  const showBalance = sellsTokens() || balance !== 0;

  // Same shape for the other half: a token-only app has no plans to list, and
  // "nothing unlocked yet — buy a plan" is the wrong sentence to put in front
  // of somebody whose app sells credit. A Member who DOES hold something (or
  // whose plan is paused) sees it either way.
  const showAccess =
    sellsPlans() || entitlements.length > 0 || paused.length > 0;

  // What this member agreed to, and whether they are the one owner this
  // installation has. Both are cheap and both are read unconditionally: an app
  // with no purposes declared gets an empty array (the shipped state), and the
  // owner count is one aggregate.
  const [consentRows, ownerCount] = await Promise.all([
    consentStatusFor(memberId),
    countOwners(),
  ]);
  const isLastOwner = session.user.role === "owner" && ownerCount <= 1;

  const t = await getTranslations("account");
  const tConsent = await getTranslations("consent");
  const format = await getFormatter();

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="flex flex-col gap-8">
        {/* AC 4. A Callout, not a bare sentence — the repo's rule for anything
            that has to stay on screen. "warning", not "danger": a missed
            payment is reversible, the account is not closed, and the copy has
            to say both or the customer reads it as a deletion. */}
        {paused.length > 0 && (
          <Callout variant="warning" title={t("pausedTitle")}>
            {t("pausedBody", {
              plans: format.list(paused.map(planName)),
            })}
          </Callout>
        )}

        {showBalance && (
          <Card>
            <CardContent className="flex flex-col gap-1">
              <CardDescription>{t("balanceTitle")}</CardDescription>
              <CardTitle className="text-3xl">{format.number(balance)}</CardTitle>
              <p className="text-muted-foreground text-sm">
                {/* AC 1: whatever the Operator's correction left behind is what
                    stands here on the next load. No cache sits in between. */}
                {account ? t("balanceHint") : t("balanceEmpty")}
              </p>
            </CardContent>
          </Card>
        )}

        {showAccess && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("accessTitle")}</h2>

          {entitlements.length === 0 ? (
            /* A paused Member has NOTHING active, so this branch is the one
               they land in — and "nothing unlocked yet, buy a plan" is exactly
               wrong for someone who already bought one and is waiting for a
               payment to go through. The Callout above would then sit directly
               over an invitation to buy the plan they are already paying for.
               Same self-contradiction pausedKeys() exists to prevent, mirrored. */
            <EmptyState
              icon={KeyRound}
              title={paused.length > 0 ? t("accessPausedTitle") : t("accessEmptyTitle")}
              description={
                paused.length > 0 ? t("accessPausedBody") : t("accessEmptyBody")
              }
            >
              {paused.length === 0 && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/plans">
                    <CreditCard aria-hidden />
                    {t("accessEmptyCta")}
                  </Link>
                </Button>
              )}
            </EmptyState>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t("columnPlan")}</TableHead>
                    <TableHead>{t("columnUntil")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entitlements.map((row) => (
                    <TableRow key={row.productKey}>
                      <TableCell className="font-medium">
                        {planName(row.productKey)}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {/* AC 2 and AC 3 in one cell. `null` is a REAL SENTENCE
                            and never a blank cell: a gap explains nothing, and
                            the Member has no way to tell "no end date" from
                            "we forgot to tell you". */}
                        {row.accessUntil ? (
                          <time dateTime={row.accessUntil.toISOString()}>
                            {format.dateTime(
                              row.accessUntil,
                              ACCESS_UNTIL_FORMAT,
                            )}
                          </time>
                        ) : (
                          t("untilNone")
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Both of these belong to the TABLE, so both hang off the same
              condition. On an empty account the hint explains a column that is
              not on screen and the card repeats the empty state's own button —
              two paragraphs of noise on the page a brand-new customer sees
              first. */}
          {entitlements.length > 0 && (
            <>
              {/* The two date-ish things in this app mean different things, and
                  §D2 asks the copy to keep them apart: THIS column is when
                  access runs out, the dashboard's card is when money next
                  moves. A purchased plan has no end date here at all — it ends
                  by Digistore24 event (AD-2), never by a stored day. */}
              <p className="text-muted-foreground text-sm">{t("accessHint")}</p>

              <Card className="mt-3">
                <CardContent className="flex flex-col items-start gap-3">
                  <div className="flex flex-col gap-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Coins
                        aria-hidden
                        className="text-muted-foreground size-4"
                      />
                      {t("moreTitle")}
                    </CardTitle>
                    <CardDescription>{t("moreBody")}</CardDescription>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/plans">
                      <CreditCard aria-hidden />
                      {t("moreCta")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </section>
        )}

        {/* Connecting an AI client to this app. Hidden entirely when the
            interface is off AND this Member holds no keys — there is no point
            showing somebody a feature their app does not offer. But a Member
            who DOES hold keys sees the section either way, so they can still
            revoke them: a switch may hide an empty thing, never a non-empty
            one (the same rule the balance card above follows). */}
        {(!mcpOff || mcpKeyRows.length > 0) && (
          <McpCard
            keys={mcpKeyRows.map((key) => ({
              id: key.id,
              name: key.name,
              prefix: key.prefix,
              scope: key.scope,
              state: key.state,
              createdAt: key.createdAt,
              lastUsedAt: key.lastUsedAt,
              expiresAt: key.expiresAt,
            }))}
            endpoint={await mcpEndpoint()}
            serverName={mcpConfig().serverName}
            maxLiveKeys={MAX_LIVE_KEYS}
            liveKeys={liveKeyCount}
            offReason={mcpOff}
          />
        )}

        {/* How this person gets in. Last on the page on purpose: a Member opens
            their account to see what they have, not to administer a login — and
            somebody who never wants a password should never have to scroll past
            an invitation to set one. */}
        <SignInCard
          email={credentials.email ?? ""}
          hasPassword={credentials.hasPassword}
          minLength={MIN_PASSWORD_LENGTH}
          mailConfigured={isEmailLoginEnabled()}
          pending={
            pendingChange
              ? {
                  newEmail: pendingChange.newEmail,
                  // Formatted here rather than in the client component: the
                  // request's language and time zone live on the server, and a
                  // Date crossing into a client component would be rendered by
                  // whatever the browser felt like.
                  expiresAt: format.dateTime(pendingChange.expiresAt, {
                    dateStyle: "long",
                    timeStyle: "short",
                  }),
                }
              : null
          }
        />

        {/* The data-protection controls, last on the page.
            Findable, not prominent — and never absent, which is the state that
            turns a right into a support ticket. See privacy-ui.tsx. */}
        <ConsentCard
          rows={consentRows.map((row) => ({
            key: row.purpose.key,
            // Looked up here rather than in the client component: the keys are
            // per-app (`consent.<key>.title`), so only an app that declared the
            // purpose has the text. A client calling `t()` on a key nobody
            // added renders the key itself at a customer.
            title: tConsent(`${row.purpose.key}.title`),
            state: row.state,
            answeredAt: row.answeredAt
              ? format.dateTime(row.answeredAt, { dateStyle: "long" })
              : null,
          }))}
        />

        <MyDataCard />

        <DeleteAccountCard
          // Only to word the warning in the dialog — it never blocks. See the
          // note on `canDeleteOwnAccount` in lib/users/rules.ts.
          hasActivePlan={entitlements.length > 0 || paused.length > 0}
          isLastOwner={isLastOwner}
        />
      </div>
    </>
  );
}
