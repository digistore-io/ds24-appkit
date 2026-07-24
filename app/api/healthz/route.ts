// Liveness — no dependencies, must always return 200 quickly.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
