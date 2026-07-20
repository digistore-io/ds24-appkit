import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Digistore SAAS App",
  description: "SAAS-Anwendung mit Digistore24-Abrechnung",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: next-themes setzt die Theme-Klasse am <html>,
    // bevor React hydriert — die Abweichung ist gewollt und betrifft nur dieses
    // eine Element.
    <html lang="de" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
