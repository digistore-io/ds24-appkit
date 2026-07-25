import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { listBillingForMember } from "@/lib/digistore/member-billing";
import { formatPrice, getProduct } from "@/lib/digistore/products";
import { getTokenAccount } from "@/lib/tokens/account";
import {
  listOwnLedger,
  shouldShowTokenTab,
  OWN_LEDGER_PAGE_SIZE,
} from "@/lib/tokens/own-ledger";
import { sellsTokens } from "@/lib/billing-mode";
import { PageHeader } from "@/components/page-header";
import { BillingTabs } from "./billing-tabs";
import { disableAutoReloadAction, enableAutoReloadAction } from "./actions";

export async function generateMetadata() {
  const t = await getTranslations("billing");
  return { title: t("title") };
}

// The member's own billing page: their purchases, one downloadable invoice per
// payment, and the Digistore24 links to cancel a subscription or update payment
// details. Scoped to the signed-in member — /dashboard is behind the sign-in
// (proxy.ts), and listBillingForMember filters on the member id, never on
// anything from the request.
export default async function BillingPage() {
  const session = await auth();
  const memberId = session?.user?.id;
  if (!memberId) redirect("/login");

  const orders = await listBillingForMember(memberId);
  const t = await getTranslations("billing");
  const locale = await getLocale();

  // Resolve the product name here (server-only registry). getProduct throws on
  // an unknown key — an order can hold one the registry lost — so fall back to
  // the key rather than crash the whole page.
  const rows = orders.map((o) => ({
    ...o,
    productName: safeProductName(o.productKey),
  }));

  // The token half. Read before the gate is decided, because the gate depends
  // on what came back: a Member who still holds tokens keeps their tab even in
  // an app that no longer sells any.
  const account = await getTokenAccount(memberId);
  const balance = account?.balance ?? 0;
  const ledger = await listOwnLedger(memberId, OWN_LEDGER_PAGE_SIZE);

  // The decision is pure and tested (lib/tokens/own-ledger.ts) — the half that
  // keeps the tab for a Member who still holds tokens in an app that no longer
  // sells any is exactly the half an inline condition loses.
  const showTokens = shouldShowTokenTab({
    sellsTokens: sellsTokens(),
    balance,
    ledgerCount: ledger.length,
    // The tab holds the only switch that stops an unattended charge, so an
    // armed account keeps it whatever else is true.
    autoReloadEnabled: account?.autoReloadEnabled,
  });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <BillingTabs
        orders={rows}
        onDisableAutoReload={disableAutoReloadAction}
        onEnableAutoReload={enableAutoReloadAction}
        tokens={
          showTokens
            ? {
                balance,
                rows: ledger,
                // The reader caps; saying so is the difference between a
                // partial view and a wrong one.
                truncated: ledger.length === OWN_LEDGER_PAGE_SIZE,
                limit: OWN_LEDGER_PAGE_SIZE,
                // Only when it is actually ARMED. `autoReloadEnabled` alone is
                // the switch; the package name is resolved here because the
                // registry is server-only, and falls back to null rather than
                // throwing when a package has since left it.
                // Shown whenever a MANDATE exists, not only when it is on —
                // the off state is what carries the switch back on, and
                // arming is otherwise a one-shot event with no recovery.
                autoReload: account?.ds24PurchaseId
                  ? {
                      enabled: account.autoReloadEnabled,
                      threshold: account.autoReloadThreshold,
                      packageName: safeProductName(account.autoReloadPackageKey),
                      price: safeProductPrice(account.autoReloadPackageKey, locale),
                    }
                  : null,
              }
            : null
        }
      />
    </>
  );
}

/**
 * What the next automatic charge will cost, formatted for this reader.
 *
 * Null when the package has left the registry — the caller says so rather than
 * printing a price that is no longer real.
 */
function safeProductPrice(key: string | null, locale: string): string | null {
  if (!key) return null;
  try {
    return formatPrice(getProduct(key), locale);
  } catch {
    return null;
  }
}

function safeProductName(key: string | null): string | null {
  if (!key) return null;
  try {
    return getProduct(key).name;
  } catch {
    return key;
  }
}
