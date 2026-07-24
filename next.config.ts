import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Runs directly with `npm run start` (next start) on Railway/Render/Fly.
  // For minimal Docker images, optionally set `output: "standalone"` and then
  // mit `node .next/standalone/server.js` starten.
};

// Wires next-intl into the app: i18n/request.ts supplies the locale + texts per
// request. Without this line `useTranslations()` finds no translations.
export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);
