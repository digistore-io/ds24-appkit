// Postgres-Verbindung + Drizzle-Client. Serverseitig verwenden.
//
// Der Client wird eager erstellt, aber postgres.js verbindet erst beim ersten
// Query — deshalb ist ein Fallback-URL beim Build unkritisch und `next build`
// scheitert nicht, wenn DATABASE_URL (noch) fehlt.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build";

// Verbindungs-Pool pro Prozess. Default 10 — trägt viele parallele Nutzer auf
// einem einzelnen Server (Railway/Render/Fly). Über DB_POOL_MAX anpassbar.
// Bei serverless/vielen Instanzen niedriger halten und einen Connection-Pooler
// (PgBouncer / Neon-/Supabase-Pooling) vorschalten. Siehe performance-gateway-Skill.
const poolMax = Number(process.env.DB_POOL_MAX ?? 10);
const client = postgres(connectionString, { max: poolMax });

export const db = drizzle(client, { schema });
export { schema };
