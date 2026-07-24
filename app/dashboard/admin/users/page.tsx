import { getTranslations } from "next-intl/server";

import { requireOwner } from "@/lib/authz";
import { listUsers } from "@/lib/users/manage";
import { PageHeader } from "@/components/page-header";
import { UserTable, CreateUserDialog } from "./ui";

export async function generateMetadata() {
  const t = await getTranslations("users");
  return { title: t("title") };
}

// User management — admins only (requireOwner as the first line).
//
// This page is part of the scaffolding: it works right away and shows what a
// protected admin feature looks like — table, create dialog, confirmation
// before deleting, a short message after every action. You can extend it
// (search, invitations) or remove it entirely if your app does not need it.
export default async function AdminUsersPage() {
  const session = await requireOwner();
  const users = await listUsers();
  const t = await getTranslations("users");

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", {
          count: users.length,
          email: session.user.email ?? "",
        })}
      >
        <CreateUserDialog />
      </PageHeader>

      <UserTable users={users} currentUserId={session.user.id as string} />

      <p className="text-muted-foreground mt-4 text-sm">
        {t.rich("hint", { code: (chunks) => <code>{chunks}</code> })}
      </p>
    </>
  );
}
