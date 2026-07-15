"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { verifyApiKey, generateIpnPassphrase } from "@/lib/digistore/client";
import { getVendorSettings, upsertVendorSettings } from "@/lib/digistore/vendor";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Nicht angemeldet");
  return session.user.id;
}

/** API-Key speichern und direkt gegen Digistore24 verifizieren. */
export async function saveApiKey(formData: FormData) {
  const userId = await requireUserId();
  const apiKey = String(formData.get("apiKey") || "").trim();
  if (!apiKey) return;
  const verified = await verifyApiKey(apiKey);
  await upsertVendorSettings(userId, {
    ds24ApiKey: apiKey,
    ds24ApiKeyVerified: verified,
  });
  revalidatePath("/onboarding/digistore");
}

/** Einmalig eine IPN-Passphrase erzeugen (falls noch keine existiert). */
export async function ensureIpnPassphrase() {
  const userId = await requireUserId();
  const existing = await getVendorSettings(userId);
  if (!existing?.ds24IpnPassphrase) {
    await upsertVendorSettings(userId, {
      ds24IpnPassphrase: generateIpnPassphrase(),
    });
  }
  revalidatePath("/onboarding/digistore");
}
