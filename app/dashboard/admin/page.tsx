import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Users, Receipt, ArrowRight } from "lucide-react";

import { requireOwner } from "@/lib/authz";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";

export async function generateMetadata() {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

// Operator/admin area — role "owner" only (see lib/authz.ts).
// A blueprint for your own admin pages: requireOwner() as the first line is
// all it takes.
export default async function AdminPage() {
  const session = await requireOwner();
  const t = await getTranslations("admin");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { email: session.user.email ?? "" })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="bg-primary/10 text-primary mb-2 grid size-9 place-items-center rounded-lg">
              <Users aria-hidden className="size-4.5" />
            </div>
            <CardTitle>{t("usersTitle")}</CardTitle>
            <CardDescription>{t("usersBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/admin/users">
                {t("usersCta")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="bg-primary/10 text-primary mb-2 grid size-9 place-items-center rounded-lg">
              <Receipt aria-hidden className="size-4.5" />
            </div>
            <CardTitle>{t("purchasesTitle")}</CardTitle>
            <CardDescription>{t("purchasesBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/admin/purchases">
                {t("purchasesCta")}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("ownerOnlyTitle")}</CardTitle>
            <CardDescription>
              {t.rich("ownerOnlyBody", {
                code: (chunks) => <code>{chunks}</code>,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">
              node run.mjs user-create --email … --role owner --apply
            </pre>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
