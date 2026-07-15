// Startet den interaktiven Connect-Flow: fordert bei Digistore24 einen API-Key an
// und leitet den Merchant zur Autorisierungsseite (request_url) weiter.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requestApiKey } from "@/lib/digistore/connect";
import { upsertVendorSettings } from "@/lib/digistore/vendor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const appUrl = process.env.APP_URL || new URL(request.url).origin;
  try {
    const { requestUrl, requestToken } = await requestApiKey({
      returnUrl: `${appUrl}/onboarding/digistore/connect/callback`,
      cancelUrl: `${appUrl}/onboarding/digistore?connect=cancelled`,
      siteUrl: appUrl,
      comment: "SAAS-App",
    });
    // request_token bis zum Callback merken.
    await upsertVendorSettings(session.user.id, { ds24RequestToken: requestToken });
    return NextResponse.redirect(requestUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unbekannt";
    return NextResponse.redirect(
      new URL(
        `/onboarding/digistore?connect=error&msg=${encodeURIComponent(msg)}`,
        request.url,
      ),
    );
  }
}
