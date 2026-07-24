import { getTranslations } from "next-intl/server";

import { requireOwner } from "@/lib/authz";
import { listOrders } from "@/lib/digistore/purchases";
import {
  isFiltered,
  parsePurchaseFilter,
  type RawSearchParams,
} from "@/lib/digistore/purchase-filter";
import { allProducts } from "@/lib/digistore/products";
import { listIpnEvents } from "@/lib/digistore/ipn-log";
import { listUsers } from "@/lib/users/manage";
import { PageHeader } from "@/components/page-header";
import { PurchasesTabs } from "./purchases-tabs";

export async function generateMetadata() {
  const t = await getTranslations("purchases");
  return { title: t("title") };
}

// Every purchase the app has recorded — admins only (requireOwner as the first
// line).
//
// The list is the whole financial record, of every status: a refund is part of
// what the Operator is asked about. Four filters narrow it (buyer address,
// product, order id, whether an account is attached) and they live in the URL,
// so the view survives a reload, a copied link and the re-render after an
// attach — story 3.7 §D4.
//
// The old work queue is one of those filters: `?assignment=unassigned` is
// exactly the set this page used to show. A purchase lands there when the buyer
// paid without being signed in and no account carries their address. Most
// resolve themselves — the buyer signs in and the claim attaches them
// automatically (lib/digistore/claim.ts). What is left is the mismatch case,
// paid under one address and account under another, and that is what the attach
// is for.
export default async function AdminPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requireOwner();
  // `searchParams` is a Promise in this Next.js version — awaiting it is not
  // optional, and forgetting it compiles cleanly and fails on the first request.
  const filter = parsePurchaseFilter(await searchParams);

  const [purchases, users, ipnEvents] = await Promise.all([
    listOrders(filter),
    listUsers(),
    listIpnEvents(),
  ]);
  const t = await getTranslations("purchases");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={
          isFiltered(filter)
            ? t("descriptionFiltered", { count: purchases.total })
            : t("description", { count: purchases.total })
        }
      />

      <PurchasesTabs
        rows={purchases.rows}
        filter={filter}
        products={allProducts().map((p) => ({ key: p.key, name: p.name }))}
        members={users.map((u) => ({ id: u.id, email: u.email }))}
        page={purchases.page}
        hasMore={purchases.hasMore}
        total={purchases.total}
        ipnEvents={ipnEvents}
      />
    </>
  );
}
