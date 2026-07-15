import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Läuft direkt mit `npm run start` (next start) auf Railway/Render/Fly.
  // Für minimale Docker-Images optional `output: "standalone"` setzen und dann
  // mit `node .next/standalone/server.js` starten.
};

export default nextConfig;
