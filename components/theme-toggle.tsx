"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

// Umschalter für das Farbschema: System (Standard) · Hell · Dunkel.
//
// Bewusst drei sichtbare Schalter statt eines Knopfes, der durchschaltet: So
// ist auf einen Blick zu sehen, was gerade gilt — insbesondere, dass „System"
// aktiv ist und die App deshalb der Systemeinstellung folgt.
const OPTIONEN = [
  { wert: "system", label: "System", Icon: Monitor },
  { wert: "light", label: "Hell", Icon: Sun },
  { wert: "dark", label: "Dunkel", Icon: Moon },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  // Auf dem Server ist die Wahl des Nutzers unbekannt (sie steht im
  // localStorage). Erst nach dem Mounten rendern, sonst meldet React eine
  // Hydration-Abweichung, sobald jemand nicht auf „System" steht.
  const [gemountet, setGemountet] = useState(false);
  useEffect(() => setGemountet(true), []);

  return (
    <div
      role="radiogroup"
      aria-label="Farbschema"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border bg-card p-0.5",
        className,
      )}
    >
      {OPTIONEN.map(({ wert, label, Icon }) => {
        const aktiv = gemountet && theme === wert;
        return (
          <button
            key={wert}
            type="button"
            role="radio"
            aria-checked={aktiv}
            aria-label={label}
            title={label}
            onClick={() => setTheme(wert)}
            className={cn(
              "rounded-md p-1.5 text-muted-foreground transition-colors",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              aktiv && "bg-muted text-foreground",
            )}
          >
            <Icon aria-hidden className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
