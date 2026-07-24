"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";
import { Monitor, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

// Switch for the color scheme: system (default) · light · dark.
//
// Deliberately three visible switches instead of one button that cycles: this
// way you see at a glance what currently applies — in particular that "system"
// is active and the app therefore follows the OS setting.
const THEME_OPTIONS = [
  { value: "system", labelKey: "system", Icon: Monitor },
  { value: "light", labelKey: "light", Icon: Sun },
  { value: "dark", labelKey: "dark", Icon: Moon },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const { theme, setTheme } = useTheme();
  // On the server the user's choice is unknown (it lives in localStorage).
  // Render only after mounting, otherwise React reports a hydration mismatch
  // as soon as someone is not on "system".
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className={cn(
        "bg-card inline-flex items-center gap-0.5 rounded-lg border p-0.5",
        className,
      )}
    >
      {THEME_OPTIONS.map(({ value, labelKey, Icon }) => {
        const active = mounted && theme === value;
        const label = t(labelKey);
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "text-muted-foreground rounded-md p-1.5 transition-colors",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              active && "bg-muted text-foreground",
            )}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
