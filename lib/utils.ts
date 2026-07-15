import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// shadcn/ui-Helper: kombiniert Klassen und löst Tailwind-Konflikte auf.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
