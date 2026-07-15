// Liveness — keine Abhängigkeiten, muss immer schnell 200 liefern.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
