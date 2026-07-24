import { getTranslations } from "next-intl/server";

import { requireOwner } from "@/lib/authz";
import { listUnattributedOrders } from "@/lib/digistore/purchases";
import { listIpnEvents } from "@/lib/digistore/ipn-log";
import { listUsers } from "@/lib/users/manage";
import { PageHeader } from "@/components/page-header";
import { PurchasesTabs } from "./purchases-tabs";

export async function generateMetadata() {
  const t = await getTranslations("purchases");
  return { title: t("title") };
}

// Purchases that reached nobody — admins only (requireOwner as the first line).
//
// A purchase lands here when the buyer paid without being signed in and no
// account carries their address. Most resolve themselves: the buyer signs in
// and the claim attaches them automatically (lib/digistore/claim.ts). What is
// left is the mismatch case — paid under one address, account under another —
// and that is what this page is for.
export default async function AdminPurchasesPage() {
  await requireOwner();
  const [rows, users, ipnEvents] = await Promise.all([
    listUnattributedOrders(),
    listUsers(),
    listIpnEvents(),
  ]);
  const t = await getTranslations("purchases");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { count: rows.length })}
      />

      <PurchasesTabs
        rows={rows}
        members={users.map((u) => ({ id: u.id, email: u.email }))}
        ipnEvents={ipnEvents}
      />
    </>
  );
}
