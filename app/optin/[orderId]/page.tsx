import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { Callout } from "@/components/ui/callout";

// Öffentliche Dankes-/Opt-in-Seite (thankyou_url-Ziel nach dem Kauf).
// Hält die DSGVO-Einwilligung des Käufers fest. Bewusst ohne Login.
export default async function OptinPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await db.query.orders.findFirst({
    where: eq(orders.ds24OrderId, orderId),
  });

  async function recordConsent() {
    "use server";
    await db
      .update(orders)
      .set({ gdprConsentAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.ds24OrderId, orderId));
    revalidatePath(`/optin/${orderId}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Danke für deinen Kauf!</h1>

      {!order ? (
        <p className="text-muted-foreground">
          Bestellung wird verarbeitet … lade die Seite in ein paar Sekunden neu.
        </p>
      ) : order.gdprConsentAt ? (
        <Callout variant="success">
          Einwilligung erteilt. Du kannst dieses Fenster schließen.
        </Callout>
      ) : (
        <form action={recordConsent} className="flex flex-col gap-4">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" required className="mt-1" />
            <span>
              Ich willige ein, dass meine Daten zur Bereitstellung des gekauften
              Angebots verarbeitet werden.
            </span>
          </label>
          <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
            Einwilligung bestätigen
          </button>
        </form>
      )}
    </main>
  );
}
