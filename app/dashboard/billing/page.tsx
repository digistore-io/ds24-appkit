import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { listBillingForMember } from "@/lib/digistore/member-billing";
import { getProduct } from "@/lib/digistore/products";
import { PageHeader } from "@/components/page-header";
import { BillingList } from "./ui";

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

  // Resolve the product name here (server-only registry). getProduct throws on
  // an unknown key — an order can hold one the registry lost — so fall back to
  // the key rather than crash the whole page.
  const rows = orders.map((o) => ({
    ...o,
    productName: safeProductName(o.productKey),
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <BillingList orders={rows} />
    </>
  );
}

function safeProductName(key: string | null): string | null {
  if (!key) return null;
  try {
    return getProduct(key).name;
  } catch {
    return key;
  }
}
