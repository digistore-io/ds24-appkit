"use client";

// Two views on the same screen: every purchase the app has recorded — filterable
// by buyer, product, order id and whether an account is attached, and where a
// purchase is still unattached, attachable to one — and the IPN log, a read-only
// record of every IPN that arrived. Kept as tabs because they answer different
// questions ("which purchase is this customer asking about?" vs "did the webhook
// even reach us?") but belong to the same Digistore24 plumbing.
import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PurchaseFilter } from "@/lib/digistore/purchase-filter";
import { PurchasesTable, type ProductOption, type Row } from "./ui";
import { IpnLogTable, type IpnRow } from "./ipn-log-table";

export function PurchasesTabs({
  rows,
  filter,
  products,
  members,
  page,
  hasMore,
  total,
  ipnEvents,
}: {
  rows: Row[];
  filter: PurchaseFilter;
  products: ProductOption[];
  members: { id: string; email: string | null }[];
  page: number;
  hasMore: boolean;
  total: number;
  ipnEvents: IpnRow[];
}) {
  const t = useTranslations("purchases");

  return (
    <Tabs defaultValue="purchases">
      <TabsList>
        <TabsTrigger value="purchases">{t("tabPurchases")}</TabsTrigger>
        <TabsTrigger value="ipn-log">{t("tabIpnLog")}</TabsTrigger>
      </TabsList>
      <TabsContent value="purchases">
        <PurchasesTable
          rows={rows}
          filter={filter}
          products={products}
          members={members}
          page={page}
          hasMore={hasMore}
          total={total}
        />
      </TabsContent>
      <TabsContent value="ipn-log">
        <IpnLogTable rows={ipnEvents} />
      </TabsContent>
    </Tabs>
  );
}
