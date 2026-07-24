import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireOwner } from "@/lib/authz";
import { findUser } from "@/lib/users/manage";
import { listGrantsFor } from "@/lib/entitlements/manage";
import { grantState } from "@/lib/entitlements/rules";
import { grantableProducts } from "@/lib/entitlements/grant-rules";
import {
  getTokenAccount,
  listLedgerFor,
  LEDGER_PAGE_SIZE,
} from "@/lib/tokens/account";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MemberBilling } from "./ui";

export async function generateMetadata() {
  const t = await getTranslations("memberBilling");
  return { title: t("title") };
}

// One Member's billing state, whole — admins only (requireOwner as the first
// line, exactly as on the list page it is reached from).
//
// The PAGE reads only. It does NOT call `getOrCreateTokenAccount`: a Member who
// never bought tokens has no account row, and creating one because an Operator
// looked at a support case would write a row on every page view. The balance is
// read as `?? 0` instead — the pattern docs/entitlements.md teaches. (The
// balance correction in ./actions.ts does create the account — but only when an
// Operator actually submits a correction, which is a write either way.)
//
// `node run.mjs smoke` CANNOT see this page: scripts/dev/smoke.mjs skips every
// directory starting with "[", so a green smoke run says nothing about it.
// Open /dashboard/admin/users/<a real id> by hand after changing anything here.
export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOwner();
  const { id } = await params;

  // `null` for an id that matches no user — a 404, not a 500. This is also the
  // Member whose account was deleted: `grants.memberId` cascades, so their
  // rows are gone with them.
  const user = await findUser(id);
  if (!user) notFound();

  const [account, ledger, grants] = await Promise.all([
    // May be undefined — a Member who never bought tokens HAS no account row.
    getTokenAccount(id),
    listLedgerFor(id, LEDGER_PAGE_SIZE + 1),
    listGrantsFor(id),
  ]);

  const t = await getTranslations("memberBilling");

  // The state is derived HERE, on the server, against one `now` shared by
  // every row: deriving it in the browser would make an expiry flip on a
  // re-render and hand the client a clock the server never agreed to.
  const now = new Date();

  return (
    <>
      <PageHeader title={user.email ?? user.id} description={t("description")}>
        <Button variant="outline" asChild>
          <Link href="/dashboard/admin/users">
            <ArrowLeft aria-hidden />
            {t("back")}
          </Link>
        </Button>
      </PageHeader>

      <MemberBilling
        memberId={user.id}
        // What the correction's confirmation names. The email if there is one —
        // an id names nobody, and the Operator has to recognise WHOSE balance
        // is about to move.
        memberLabel={user.email ?? user.id}
        balance={account?.balance ?? 0}
        hasAccount={Boolean(account)}
        ledger={ledger.slice(0, LEDGER_PAGE_SIZE)}
        ledgerLimit={LEDGER_PAGE_SIZE}
        ledgerTruncated={ledger.length > LEDGER_PAGE_SIZE}
        grants={grants.map((grant) => ({
          ...grant,
          state: grantState(grant, now),
        }))}
        // Resolved on the SERVER: the registry is a JSON import, and shipping
        // the whole of it to the browser would carry prices and Digistore24
        // product ids into a page that needs a key and a name. Token packages
        // are already gone here — `grantableProducts()` is the tested rule, not
        // the dropdown (§D4).
        grantableProducts={grantableProducts().map((product) => ({
          key: product.key,
          name: product.name,
        }))}
      />
    </>
  );
}
