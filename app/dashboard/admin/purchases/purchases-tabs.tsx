"use client";

// Two views on the same screen: the unattributed purchases the Operator acts on
// (attach to a member), and the IPN log — a read-only record of every IPN that
// arrived. Kept as tabs because they answer different questions ("whose payment
// is stray?" vs "did the webhook even reach us?") but belong to the same
// Digistore24 plumbing.
import { useTranslations } from "next-intl";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnattributedTable, type Row } from "./ui";
import { IpnLogTable, type IpnRow } from "./ipn-log-table";

export function PurchasesTabs({
  rows,
  members,
  ipnEvents,
}: {
  rows: Row[];
  members: { id: string; email: string | null }[];
  ipnEvents: IpnRow[];
}) {
  const t = useTranslations("purchases");

  return (
    <Tabs defaultValue="unattributed">
      <TabsList>
        <TabsTrigger value="unattributed">{t("tabUnattributed")}</TabsTrigger>
        <TabsTrigger value="ipn-log">{t("tabIpnLog")}</TabsTrigger>
      </TabsList>
      <TabsContent value="unattributed">
        <UnattributedTable rows={rows} members={members} />
      </TabsContent>
      <TabsContent value="ipn-log">
        <IpnLogTable rows={ipnEvents} />
      </TabsContent>
    </Tabs>
  );
}
