import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getVendorSettings } from "@/lib/digistore/vendor";
import { saveApiKey, ensureIpnPassphrase } from "./actions";

// Onboarding-Wizard: API-Key hinterlegen → IPN-URL/Passphrase erzeugen →
// in Digistore24 eintragen → Verbindungstest.
export default async function DigistoreOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string; msg?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const settings = await getVendorSettings(session.user.id);
  const connectEnabled = Boolean(process.env.DIGISTORE_DEVELOPER_KEY);
  const sp = await searchParams;
  const hdrs = await headers();
  const appUrl =
    process.env.APP_URL ||
    `${hdrs.get("x-forwarded-proto") ?? "http"}://${hdrs.get("host")}`;
  const webhookUrl = `${appUrl}/api/ipn/${session.user.id}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-8">
      <h1 className="text-2xl font-semibold">Digistore24 einrichten</h1>

      {sp.connect === "success" && (
        <p className="rounded-lg border border-green-600 p-3 text-sm text-green-600">
          ✓ Digistore24 verbunden — API-Key übernommen.
        </p>
      )}
      {sp.connect && sp.connect !== "success" && (
        <p className="rounded-lg border border-amber-600 p-3 text-sm text-amber-600">
          Verbindung {sp.connect}
          {sp.msg ? `: ${sp.msg}` : ""}.
        </p>
      )}

      {/* Schritt 1: API-Key */}
      <section className="rounded-lg border p-4">
        <h2 className="font-medium">1. API-Key</h2>
        {connectEnabled && (
          <div className="mt-2">
            <a
              href="/onboarding/digistore/connect"
              className="inline-block rounded-lg bg-primary px-4 py-2 text-primary-foreground"
            >
              Mit Digistore24 verbinden
            </a>
            <p className="mt-2 text-sm text-muted-foreground">
              Ein Klick — du meldest dich bei Digistore24 an, bestätigst, und der
              API-Key wird automatisch übernommen (kein Kopieren nötig).
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Oder API-Key manuell eintragen:
            </p>
          </div>
        )}
        {!connectEnabled && (
          <p className="mt-1 text-sm text-muted-foreground">
            Digistore24 → Einstellungen → API. Für Checkout-Links wird ein
            <code> writable</code>-Key benötigt.
          </p>
        )}
        <form action={saveApiKey} className="mt-3 flex gap-2">
          <input
            name="apiKey"
            type="password"
            required
            defaultValue={settings?.ds24ApiKey ?? ""}
            placeholder="DS24 API-Key"
            className="flex-1 rounded-lg border px-3 py-2"
          />
          <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
            Speichern & prüfen
          </button>
        </form>
        <p className="mt-2 text-sm">
          Status:{" "}
          {settings?.ds24ApiKeyVerified ? (
            <span className="text-green-600">✓ verifiziert</span>
          ) : (
            <span className="text-muted-foreground">nicht verifiziert</span>
          )}
        </p>
      </section>

      {/* Schritt 2: IPN */}
      <section className="rounded-lg border p-4">
        <h2 className="font-medium">2. IPN-Webhook</h2>
        {settings?.ds24IpnPassphrase ? (
          <div className="mt-2 space-y-2 text-sm">
            <p>
              Trage in Digistore24 (Einstellungen → IPN) folgende Werte ein,
              Signaturmethode <strong>SHA512</strong>:
            </p>
            <div>
              <div className="text-muted-foreground">IPN-URL</div>
              <code className="block break-all rounded bg-muted px-2 py-1">
                {webhookUrl}
              </code>
            </div>
            <div>
              <div className="text-muted-foreground">Passphrase</div>
              <code className="block break-all rounded bg-muted px-2 py-1">
                {settings.ds24IpnPassphrase}
              </code>
            </div>
            <p>
              Verbindung:{" "}
              {settings.ds24IpnVerified ? (
                <span className="text-green-600">✓ getestet</span>
              ) : (
                <span className="text-muted-foreground">
                  noch kein IPN empfangen — in Digistore24 „Verbindung testen“
                </span>
              )}
            </p>
          </div>
        ) : (
          <form action={ensureIpnPassphrase} className="mt-3">
            <button className="rounded-lg border px-4 py-2">
              IPN-URL & Passphrase erzeugen
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
