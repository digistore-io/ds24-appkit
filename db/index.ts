// Postgres connection + Drizzle client. For server-side use.
//
// The client is created eagerly, but postgres.js only connects on the first
// query — which is why a fallback URL at build time is harmless and
// `next build` does not fail when DATABASE_URL is (still) missing.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build";

// Connection pool per process. Default 10 — carries many concurrent users on a
// single server (Railway/Render/Fly/DigitalOcean). Adjustable via DB_POOL_MAX. On
// serverless / with many instances keep it lower and put a connection pooler
// (PgBouncer / Neon or Supabase pooling) in front. See the performance-gateway
// skill.
const poolMax = Number(process.env.DB_POOL_MAX ?? 10);
const client = postgres(connectionString, {
  max: poolMax,
  types: {
    // `timestamp` columns (OID 1114) carry NO time zone, and this project
    // stores UTC in them — drizzle writes `value.toISOString()` and reads them
    // back as UTC. postgres.js, left alone, hands the wire form
    // "2026-07-22 12:00:00" to `new Date(...)`, which V8 interprets in the
    // PROCESS's zone. On a host at UTC+2 every timestamp arrives two hours
    // early — measured, not theorised.
    //
    // Nothing noticed until an Operator page started rendering clock times and
    // a pure function started comparing a stored expiry against `Date.now()`:
    // the SQL comparison (`activeFor`) happens inside Postgres and is right,
    // the JS one was wrong by the host's offset, and the two disagreed about
    // whether a grant had expired.
    //
    // Fixing it here rather than by demanding `TZ=UTC` from every host: the
    // column's meaning is UTC, so say so where it is read.
    1114: {
      to: 1114,
      from: [1114],
      serialize: (v: Date | string) =>
        v instanceof Date ? v.toISOString() : v,
      parse: (v: string) => new Date(v.endsWith("Z") ? v : v + "Z"),
    },
  },
});

export const db = drizzle(client, { schema });
export { schema };
