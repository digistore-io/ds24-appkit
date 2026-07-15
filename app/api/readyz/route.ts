// Readiness — prüft, ob die DB erreichbar ist. 503, wenn nicht.
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ status: "ready" });
  } catch {
    return Response.json({ status: "not-ready" }, { status: 503 });
  }
}
