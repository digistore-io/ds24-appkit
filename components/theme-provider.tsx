"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// Hell/Dunkel-Umschaltung. Steckt in app/layout.tsx um die ganze App.
//
// next-themes setzt die Klasse `.dark` am <html> und schreibt die Wahl in den
// localStorage. Ein kleines Inline-Skript im <head> tut das noch vor dem ersten
// Frame — ohne das blitzt beim Laden kurz das helle Layout auf.
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
