import Link from "next/link";
import {
  productsByKind,
  formatPrice,
  intervalLabel,
  hasProductId,
  productBuyUrl,
  type ProductDef,
} from "@/lib/digistore/products";

// Öffentliche Tarif-Seite — gespeist aus config/digistore-products.json.
//
// Das ist Grundgerüst: Die Tarife dort sind Beispiele. Ändere Namen, Preise und
// Merkmale in der JSON, oder lösche diese Seite, wenn deine App keine Tarife
// braucht. Es gibt bewusst keine zweite Preisliste im Code — die Registry ist
// die einzige Quelle, damit Anzeige und Digistore24 nie auseinanderlaufen.
export const metadata = { title: "Tarife" };

function PlanCard({ def }: { def: ProductDef }) {
  const gekauft = hasProductId(def.key);
  return (
    <div
      className={`flex flex-col gap-4 rounded-lg border p-6 ${
        def.highlight ? "border-primary shadow-sm" : ""
      }`}
    >
      {def.highlight ? (
        <span className="self-start rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground">
          Beliebteste Wahl
        </span>
      ) : null}

      <div>
        <h3 className="text-lg font-medium">{def.name}</h3>
        {def.tagline ? (
          <p className="text-sm text-muted-foreground">{def.tagline}</p>
        ) : null}
      </div>

      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold">{formatPrice(def)}</span>
        <span className="text-sm text-muted-foreground">
          {intervalLabel(def)}
        </span>
      </p>

      {def.features?.length ? (
        <ul className="flex flex-col gap-1 text-sm">
          {def.features.map((f) => (
            <li key={f} className="flex gap-2">
              <span aria-hidden>✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {gekauft ? (
        <a
          href={productBuyUrl(def.key)}
          className="mt-auto rounded-lg bg-primary px-4 py-2 text-center text-primary-foreground"
        >
          Jetzt buchen
        </a>
      ) : (
        // Ohne productId gibt es noch keinen Checkout — ehrlich anzeigen statt
        // einen toten Link zu bauen.
        <p className="mt-auto rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
          Noch nicht bei Digistore24 angelegt
          <br />
          <code>make ds24-sync ARGS=--apply</code>
        </p>
      )}
    </div>
  );
}

export default function TarifePage() {
  const abos = productsByKind("subscription");
  const token = productsByKind("token");

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Tarife</h1>
        <Link href="/" className="text-sm text-muted-foreground underline">
          ← Startseite
        </Link>
      </div>

      {abos.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-medium">Abo</h2>
            <p className="text-muted-foreground">
              Läuft weiter, bis du kündigst.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {abos.map((def) => (
              <PlanCard key={def.key} def={def} />
            ))}
          </div>
        </section>
      ) : null}

      {token.length > 0 ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-medium">Token-Guthaben</h2>
            <p className="text-muted-foreground">
              Einmal kaufen, nach Verbrauch einsetzen — kein Abo.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {token.map((def) => (
              <PlanCard key={def.key} def={def} />
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Alle Preise inkl. gesetzlicher MwSt. Die Abrechnung übernimmt
        Digistore24.
      </p>
    </main>
  );
}
