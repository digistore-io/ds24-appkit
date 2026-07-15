// Callback des Connect-Flows: Digistore24 leitet nach der Autorisierung hierher.
// Holt den fertigen API-Key per retrieveApiKey und speichert ihn beim Vendor.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { retrieveApiKey } from "@/lib/digistore/connect";
import { getVendorSettings, upsertVendorSettings } from "@/lib/digistore/vendor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: Request, query: string) {
  return NextResponse.redirect(
    new URL(`/onboarding/digistore?${query}`, request.url),
  );
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const settings = await getVendorSettings(session.user.id);
  const token = settings?.ds24RequestToken;
  if (!token) return back(request, "connect=error&msg=kein-token");

  try {
    const result = await retrieveApiKey(token);
    if (result.status !== "completed" || !result.apiKey) {
      // pending/aborted → Token behalten (pending) bzw. Hinweis.
      return back(request, `connect=${result.status}`);
    }
    // API-Key übernehmen; optionale SHA-Passphrase gleich mitnehmen.
    await upsertVendorSettings(session.user.id, {
      ds24ApiKey: result.apiKey,
      ds24ApiKeyVerified: true,
      ds24RequestToken: null,
      ...(result.thankyouPageKey
        ? { ds24IpnPassphrase: result.thankyouPageKey }
        : {}),
    });
    return back(request, "connect=success");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unbekannt";
    return back(request, `connect=error&msg=${encodeURIComponent(msg)}`);
  }
}
