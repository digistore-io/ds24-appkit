"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { isRole } from "@/lib/roles";

// Shows a role as a badge — "Admin" or "User", translated.
//
// The display names live in `messages/*.json` under `roles`; the technical
// names ("owner"/"member") stay in the code. Whoever adds a role enters it in
// lib/roles.ts AND in both message files.
export function RoleBadge({ role }: { role?: string | null }) {
  const t = useTranslations("roles");
  if (!role) return null;

  // Unknown role: better to show the raw value than an empty space — that way
  // what is actually in the database stays visible.
  const label = isRole(role) ? t(role) : role;

  return (
    <Badge variant={role === "owner" ? "default" : "secondary"}>{label}</Badge>
  );
}
