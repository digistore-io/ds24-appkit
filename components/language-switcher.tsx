// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Languages } from "lucide-react";

import { LOCALES, LOCALE_LABELS, type Locale } from "@/i18n/config";
import { setLocaleAction } from "@/i18n/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Language switcher. Writes the choice into a cookie and reloads the page with
// the texts of the new language (see i18n/actions.ts).
//
// The language names are deliberately written IN their own language
// ("Deutsch", "English") and are not translated: someone who does not
// understand the current language is looking for exactly that.
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("language");
  const current = useLocale() as Locale;
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={className}
          aria-label={t("label")}
          disabled={pending}
        >
          <Languages aria-hidden />
          <span className="uppercase">{current}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onSelect={() => startTransition(() => setLocaleAction(locale))}
          >
            <Check
              aria-hidden
              className={locale === current ? "opacity-100" : "opacity-0"}
            />
            {LOCALE_LABELS[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
