// Lese-/Schreibhelfer für die Digistore-Zugangsdaten eines Vendors.
import { db } from "@/db";
import { vendorSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export type VendorSettingsPatch = Partial<{
  ds24ApiKey: string;
  ds24ApiKeyVerified: boolean;
  ds24RequestToken: string | null;
  ds24IpnPassphrase: string;
  ds24IpnVerified: boolean;
}>;

export async function getVendorSettings(userId: string) {
  return db.query.vendorSettings.findFirst({
    where: eq(vendorSettings.userId, userId),
  });
}

export async function upsertVendorSettings(
  userId: string,
  patch: VendorSettingsPatch,
) {
  await db
    .insert(vendorSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({
      target: vendorSettings.userId,
      set: { ...patch, updatedAt: new Date() },
    });
}
