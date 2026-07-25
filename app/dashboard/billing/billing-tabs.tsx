"use client";

// Two views on the same money: what the Member BOUGHT (purchases, invoices,
// subscription management) and what their prepaid balance DID (the token
// journal). Tabs rather than two pages — they answer different questions but a
// customer asking "what did I pay for" and "where did my tokens go" is the same
// person on the same errand.
//
// Purchases stays the default: every app on this template has purchases, only
// some sell tokens.
import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillingList, type Row } from "./ui";
import { TokensTab } from "./tokens-tab";
import type { OwnLedgerRow } from "@/lib/tokens/own-ledger";
import type { AutoReloadState } from "./actions";

export function BillingTabs({
  orders,
  tokens,
  onDisableAutoReload,
  onEnableAutoReload,
}: {
  orders: Row[];
  /** `null` when this app sells no tokens AND this Member holds none. */
  tokens: {
    balance: number;
    rows: OwnLedgerRow[];
    truncated: boolean;
    limit: number;
    autoReload: {
      enabled: boolean;
      threshold: number;
      packageName: string | null;
      price: string | null;
    } | null;
  } | null;
  onDisableAutoReload: (state: AutoReloadState) => Promise<AutoReloadState>;
  onEnableAutoReload: (state: AutoReloadState) => Promise<AutoReloadState>;
}) {
  const t = useTranslations("billing");

  // No token half to show: render the purchases list plain, with no lone tab
  // sitting above it explaining nothing.
  if (!tokens) return <BillingList orders={orders} />;

  return (
    <Tabs defaultValue="purchases">
      <TabsList>
        <TabsTrigger value="purchases">{t("tabPurchases")}</TabsTrigger>
        <TabsTrigger value="tokens">{t("tabTokens")}</TabsTrigger>
      </TabsList>
      <TabsContent value="purchases">
        <BillingList orders={orders} />
      </TabsContent>
      <TabsContent value="tokens">
        <TokensTab
          balance={tokens.balance}
          rows={tokens.rows}
          truncated={tokens.truncated}
          limit={tokens.limit}
          autoReload={tokens.autoReload}
          onDisableAutoReload={onDisableAutoReload}
          onEnableAutoReload={onEnableAutoReload}
        />
      </TabsContent>
    </Tabs>
  );
}
