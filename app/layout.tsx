import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digistore SAAS App",
  description: "SAAS-Anwendung mit Digistore24-Abrechnung",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
