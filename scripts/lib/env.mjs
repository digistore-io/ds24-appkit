// Lädt .env in process.env — für die CLI-Skripte in scripts/.
//
// Bewusst ohne Node-Flag (`--env-file`) gelöst: das gibt es je nach Node-Version
// mit unterschiedlichem Namen. Diese Variante läuft überall ab Node 18.
//
// Regeln: bereits gesetzte Umgebungsvariablen gewinnen (damit
// `DATABASE_URL=… npm run db:seed` weiterhin funktioniert), Kommentare und
// leere Zeilen werden ignoriert, umschließende Anführungszeichen entfernt.
import { readFileSync, existsSync } from "node:fs";

export function loadEnv(file = ".env") {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Import mit Seiteneffekt: `import "../lib/env.mjs"` genügt in den Skripten.
loadEnv();
