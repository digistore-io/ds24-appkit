---
name: performance-gateway
description: Performance-Gateway vor dem Launch. Stellt sicher, dass die erste Version bis ~100 parallele Nutzer zuverlässig und schnell läuft. Prüft und behebt die typischen Engpässe (Datenbank-Pooling, fehlende Indizes, N+1-Abfragen, unnötige Renderarbeit), führt einen einfachen Lasttest durch und richtet die passende Hosting-/DB-Größe ein. Nutze dies nach dem Security-Gateway und vor dem Launch.
---

# Performance-Gateway — bis 100 parallele Nutzer

Ziel der ersten Version: **~100 gleichzeitige Nutzer** laufen flüssig (niedrige
Latenz, keine Fehler). Vorgehen: **messen → Engpässe finden → beheben → erneut
messen.** Nicht raten — mit einem kleinen Lasttest belegen.

## Die typischen Engpässe (prüfen und beheben)

### 1. Datenbank-Verbindungen (häufigste Ursache)
- Der DB-Client (`db/index.ts`) nutzt einen **Pool** mit `DB_POOL_MAX` (Default 10).
  Bei einem einzelnen, dauerhaft laufenden Server (Railway/Render/Fly) sollte der
  Pool mehrere Verbindungen haben (10–20) — **nicht 1**, sonst werden alle Anfragen
  serialisiert.
- **Serverless/mehrere Instanzen:** Verbindungen summieren sich (Instanzen × Pool).
  Dann einen **Connection-Pooler** vorschalten (z. B. PgBouncer / Neon-/Supabase-
  Pooling) und `DB_POOL_MAX` klein halten. Postgres-`max_connections` beachten.
- Prüfen, dass **eine** Client-Instanz pro Prozess existiert (kein neuer Client pro
  Request).

### 2. Indizes für häufige Abfragen
- Postgres indiziert Fremdschlüssel **nicht** automatisch. Für Spalten in häufigen
  `WHERE`-Filtern Indizes anlegen, z. B. `orders.user_id`, `orders.ds24_product_id`,
  und Domänen-FKs (z. B. `challenges.user_id`). Unique-Spalten (`ds24_order_id`,
  `(user_id, offer_key)`) sind bereits indiziert.
- Nach Schemaänderung: `npm run db:generate && npm run db:migrate`.

### 3. Abfragen & Rendering
- **N+1 vermeiden:** Listen mit einer Abfrage laden (Drizzle-`with`/Joins), nicht je
  Element einzeln.
- Nur benötigte Spalten/Zeilen selektieren; Paginierung bei großen Listen.
- Statische/öffentliche Seiten möglichst cachen; teure Arbeit nicht bei jedem Render.
- Checkout-URLs werden bereits gecacht (`buy_url_cache`) — nicht pro Request neu erzeugen.

### 4. Hosting-Größe
- Eine kleine, aber nicht kleinste Instanz wählen; Autoscaling/Min-Instanzen so
  setzen, dass Kaltstarts den Launch nicht ausbremsen.
- Managed Postgres mit ausreichend Verbindungen/RAM für den Start.

## Lasttest (Nachweis ~100 parallel)

Führe einen einfachen Lasttest gegen die wichtigsten Pfade durch (Startseite,
Zugriffs-/Content-Seite, ggf. IPN-Endpoint) und prüfe Latenz und Fehlerrate bei
~100 gleichzeitigen Verbindungen. Beispiel mit `autocannon` (ohne Installation):

```bash
npx autocannon -c 100 -d 20 http://localhost:3000/            # 100 Verbindungen, 20s
npx autocannon -c 100 -d 20 http://localhost:3000/api/healthz
```

Richtwerte für die erste Version: **0 Fehler/Timeouts**, p95-Latenz im dreistelligen
ms-Bereich für dynamische Seiten. Reißt es aus → obige Punkte (v. a. DB-Pool/Indizes)
prüfen und erneut messen.

## Ablauf

1. **Messen:** Lasttest gegen 2–3 zentrale Endpoints bei `-c 100`.
2. **Beheben:** größten Engpass zuerst (meist DB-Pool oder fehlender Index).
3. **Erneut messen:** bis die Richtwerte erreicht sind.
4. **Berichten:** kurze Zusammenfassung (vorher/nachher, was geändert wurde).

Nächster Schritt nach grünem Performance-Gateway: **`compliance-check`** (Recht),
dann **`go-live`** (online stellen), dann **`go-to-market`** (Vermarktung).
