"use client";

// The frame around every page in the protected area (`app/dashboard/*`):
// sidebar on the left, header on top, content on the right. On narrow screens
// the sidebar opens as an overlay (Sheet).
//
// ── Adding a page to the navigation ────────────────────────────────────────
// Just extend the NAVIGATION list below — active highlighting, mobile view and
// keyboard handling come for free:
//
//   { href: "/dashboard/projects", labelKey: "projects", icon: FolderKanban }
//
// `labelKey` points into the `nav` namespace in `messages/*.json`; the text
// belongs there, not here. Entries with `ownerOnly: true` are only visible to
// the "owner" role — that is pure cosmetics, the page itself MUST still start
// with `requireOwner()`, otherwise it remains reachable via the address bar.
//
// `featureKey` hides an entry whose feature is switched off on this
// installation. Same caveat, twice over: hiding a link is not protecting a
// page. The page still renders its own notice, and the route handler behind it
// still refuses — see `app/api/chat/route.ts`. What the flag prevents is a menu
// entry leading somewhere that only ever says "not configured".

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  CircleUser,
  CreditCard,
  FileText,
  MessageCircle,
  ShieldCheck,
  Users,
  Receipt,
  Coins,
  LogOut,
  Menu,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { RoleBadge } from "@/components/role-badge";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Optional features, resolved on the server and passed in as booleans. */
export interface ShellFeatures {
  /** The in-app assistant — `lib/ai/chat-config.ts` → `isChatEnabled()`. */
  chat?: boolean;
}

export interface NavItem {
  href: string;
  /** Key in the `nav` namespace of the message files. */
  labelKey: string;
  icon: LucideIcon;
  /** Visible to the "owner" role only. */
  ownerOnly?: boolean;
  /** Hidden unless this feature is switched on. */
  featureKey?: keyof ShellFeatures;
  /** Key of a section heading rendered before this entry. */
  groupKey?: string;
}

export const NAVIGATION: NavItem[] = [
  { href: "/dashboard", labelKey: "overview", icon: LayoutDashboard },
  // The Member's own account: what they may use, until when, and their balance
  // (story 3.5). Under /dashboard, so `proxy.ts` already guards it — a
  // route OUTSIDE that prefix would be public until the matcher named it.
  { href: "/dashboard/account", labelKey: "account", icon: CircleUser },
  // The Member's purchases, invoices and subscription self-service — visible to
  // every signed-in member (NOT ownerOnly). Scoped to them by the page itself.
  { href: "/dashboard/billing", labelKey: "billing", icon: FileText },
  // The assistant. Optional — an app without an ANTHROPIC_API_KEY, or with
  // `"enabled": false` in config/ai-chat.json, does not show this at all.
  {
    href: "/dashboard/chat",
    labelKey: "chat",
    icon: MessageCircle,
    featureKey: "chat",
  },
  { href: "/plans", labelKey: "plans", icon: CreditCard },
  {
    href: "/dashboard/admin",
    labelKey: "admin",
    icon: ShieldCheck,
    ownerOnly: true,
    groupKey: "groupOperator",
  },
  {
    href: "/dashboard/admin/users",
    labelKey: "users",
    icon: Users,
    ownerOnly: true,
  },
  {
    href: "/dashboard/admin/purchases",
    labelKey: "purchases",
    icon: Receipt,
    ownerOnly: true,
  },
  // What the AI layer costs. NOT behind `featureKey: "chat"` — the assistant is
  // one task among however many the Operator adds, and a page that vanishes
  // when she is switched off would hide the bill for all the others.
  {
    href: "/dashboard/admin/ai-costs",
    labelKey: "aiCosts",
    icon: Coins,
    ownerOnly: true,
  },
];

export interface ShellUser {
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

/** Initials for the avatar — "anna.mueller@x.com" becomes "AM". */
function initials(user: ShellUser): string {
  const source = user.name?.trim() || user.email?.split("@")[0] || "?";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (letters || source.slice(0, 2)).toUpperCase();
}

/**
 * Is this the active entry? An exact match, or a prefix for sub-pages — but
 * "/dashboard" must not light up on every sub-page, or two entries would be
 * active at once. Hence the more specific entry wins.
 */
function isActive(pathname: string, href: string, all: NavItem[]): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  return !all.some(
    (other) =>
      other.href !== href &&
      other.href.startsWith(href + "/") &&
      (pathname === other.href || pathname.startsWith(other.href + "/")),
  );
}

function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href, items);
        const Icon = item.icon;
        return (
          <React.Fragment key={item.href}>
            {item.groupKey && (
              <p className="text-muted-foreground mt-4 mb-1 px-3 text-xs font-medium tracking-wide uppercase">
                {t(item.groupKey)}
              </p>
            )}
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                active &&
                  "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              {t(item.labelKey)}
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function BrandLink({ appName }: { appName: string }) {
  return (
    <Link
      href="/dashboard"
      className="flex items-center gap-2 font-semibold tracking-tight"
    >
      <span
        aria-hidden
        className="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold"
      >
        {appName.slice(0, 1).toUpperCase()}
      </span>
      <span className="truncate">{appName}</span>
    </Link>
  );
}

function SidebarFooter() {
  const t = useTranslations("theme");
  return (
    // The toggle deliberately sits on the RIGHT: in development Next.js shows
    // its own button in the bottom left and would cover it. The language
    // switcher sits up in the header for the same reason.
    <div className="flex items-center justify-between gap-2 border-t p-3">
      <span className="text-muted-foreground pl-10 text-xs">{t("label")}</span>
      <ThemeToggle />
    </div>
  );
}

function UserMenu({
  user,
  signOutAction,
}: {
  user: ShellUser;
  signOutAction: () => Promise<void>;
}) {
  const t = useTranslations("shell");
  // The account entry reads the SIDEBAR's label, not one of its own. Two names
  // for one page is how somebody ends up looking for their password behind both
  // and finding it behind neither.
  const tNav = useTranslations("nav");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-2"
          aria-label={t("openUserMenu")}
        >
          <Avatar className="size-7">
            <AvatarFallback className="text-xs">
              {initials(user)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm sm:inline">
            {user.name || user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">
            {user.name || user.email}
          </p>
          {user.name && user.email && (
            <p className="text-muted-foreground truncate text-xs">
              {user.email}
            </p>
          )}
          <span className="mt-2 inline-flex">
            <RoleBadge role={user.role} />
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* Where a Member changes their email address and their password. It is
            in the sidebar too, and that was not enough: the entry is named
            after what the page GRANTS ("Mein Zugang" / "My access"), so nobody
            looking for their sign-in details recognised it. The name changed
            with this entry; this menu is simply where people look for it. */}
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account">
            <CircleUser aria-hidden className="size-4" />
            {tNav("account")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Signing out is a server action — hence a real form and not an
            onClick. Last, and separated: it is the destructive item, and a
            settings link placed under it is one people mis-click past. */}
        <form action={signOutAction}>
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOut aria-hidden className="size-4" />
              {t("signOut")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({
  appName,
  user,
  features,
  signOutAction,
  children,
}: {
  /** Name in the top left (lib/app.ts). */
  appName: string;
  user: ShellUser;
  /**
   * Which optional features are on. Resolved on the SERVER and handed down as
   * booleans — the modules that answer this read config files carrying prices
   * and product ids, which have no business in a browser bundle.
   */
  features?: ShellFeatures;
  /** Server action that signs out (see app/dashboard/layout.tsx). */
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const t = useTranslations("nav");
  const tShell = useTranslations("shell");
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  const items = NAVIGATION.filter(
    (item) =>
      (!item.ownerOnly || user.role === "owner") &&
      (!item.featureKey || features?.[item.featureKey] === true),
  );
  const current = items.find((item) => isActive(pathname, item.href, items));

  return (
    <div className="min-h-screen">
      {/* Sidebar — fixed from "lg" up, below that inside the Sheet (see below). */}
      <aside className="bg-card fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r lg:flex">
        <div className="flex h-14 items-center border-b px-4">
          <BrandLink appName={appName} />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks items={items} />
        </div>
        <SidebarFooter />
      </aside>

      <div className="lg:pl-60">
        <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur-sm sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={tShell("openNavigation")}
              >
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 gap-0 p-0">
              <div className="flex h-14 items-center border-b px-4">
                <SheetTitle asChild>
                  <div>
                    <BrandLink appName={appName} />
                  </div>
                </SheetTitle>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <NavLinks items={items} onNavigate={() => setMobileOpen(false)} />
              </div>
              <SidebarFooter />
            </SheetContent>
          </Sheet>

          <h2 className="truncate text-sm font-medium">
            {current ? t(current.labelKey) : ""}
          </h2>

          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            <UserMenu user={user} signOutAction={signOutAction} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
