import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Coins, CreditCard, KeyRound } from "lucide-react";

import { auth } from "@/auth";
import { entitlementsFor, suspendedKeysFor } from "@/lib/entitlements/manage";
import { pausedKeys } from "@/lib/entitlements/rules";
import { getProduct } from "@/lib/digistore/products";
import { getTokenAccount } from "@/lib/tokens/account";
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

  const [entitlements, suspended, account] = await Promise.all([
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
  ]);

  // Suspended AND not covered by something else the Member can still use. A key
  // held through a failed subscription plus an Operator's comp is not paused,
  // and saying so beside the same plan listed as available is a contradiction
  // the Member cannot resolve. Pure, and tested — lib/entitlements/rules.ts.
  const paused = pausedKeys(entitlements, suspended);

  const t = await getTranslations("account");
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

        <Card>
          <CardContent className="flex flex-col gap-1">
            <CardDescription>{t("balanceTitle")}</CardDescription>
            <CardTitle className="text-3xl">
              {format.number(account?.balance ?? 0)}
            </CardTitle>
            <p className="text-muted-foreground text-sm">
              {/* AC 1: whatever the Operator's correction left behind is what
                  stands here on the next load. No cache sits in between. */}
              {account ? t("balanceHint") : t("balanceEmpty")}
            </p>
          </CardContent>
        </Card>

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
      </div>
    </>
  );
}
