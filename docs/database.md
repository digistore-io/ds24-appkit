# Datenbank & Migrationen

Die App nutzt **Postgres** mit **Drizzle ORM**. Das Schema steht in
`db/schema.ts` (plus `db/schema-digistore.ts`, `db/schema-tokens.ts`) — das ist
die einzige Wahrheit über die Tabellenstruktur.

Änderungen an der Datenbank laufen **immer über Migrationen**: kleine SQL-Dateien
in `drizzle/`, die eingecheckt werden und in jeder Umgebung (lokal, Staging,
Produktion) in derselben Reihenfolge laufen. So sieht die Datenbank überall
gleich aus — und niemand verliert versehentlich Daten.

## Der Weg für eine Schemaänderung

```bash
# 1. db/schema.ts anpassen (Tabelle/Spalte hinzufügen)

# 2. Migration erzeugen — Drizzle vergleicht Schema und letzten Stand
make db-generate

# 3. Die neue Datei in drizzle/ ansehen (ist das das erwartete SQL?)

# 4. Einspielen
make db-migrate

# 5. Migration mit einchecken — sie gehört zum Code
git add db/schema.ts drizzle/
```

**Wichtig:** Migrationsdateien in `drizzle/` nach dem Einspielen **nicht mehr
ändern**. Drizzle merkt sich in der Tabelle `__drizzle_migrations`, was schon
gelaufen ist. Ein Fehler wird durch eine *neue* Migration korrigiert, nicht durch
Editieren der alten.

## Die Befehle

| Befehl | Was er tut | Wo |
|---|---|---|
| `make db-migrate` | spielt ausstehende Migrationen ein | lokal **und** in Produktion |
| `make db-generate` | erzeugt eine Migration aus einer Schemaänderung | nur Entwicklung |
| `make db-reset` | löscht alles, migriert neu, spielt den Seed ein | **nur lokal** |
| `make db-seed` | legt Ausgangsdaten an (`scripts/db/seed.mjs`) | nur Entwicklung |
| `make db-studio` | Datenbank im Browser ansehen | nur Entwicklung |
| `make db-nuke` | Container **und** Datenvolume löschen | nur lokal |

`make start` führt `make db-migrate` automatisch aus — die lokale Datenbank ist
beim Start also immer aktuell.

## `db-push` vs. Migrationen

`npm run db:push` schreibt das Schema direkt in die Datenbank, ohne Migrationsdatei.
Das ist bequem beim schnellen Herumprobieren an einer **leeren lokalen** Datenbank,
hinterlässt aber keine Spur — andere Umgebungen bekommen die Änderung nie.

> **Regel:** In Staging und Produktion läuft ausschließlich `make db-migrate`.
> `db:push` niemals gegen eine Datenbank mit echten Daten.

Wenn du lokal mit `db:push` experimentiert hast, hol den Stand so wieder ein:
`make db-reset` (leert alles und baut es sauber aus den Migrationen auf).

## Seed-Daten

`scripts/db/seed.mjs` legt Ausgangsdaten für die Entwicklung an — standardmäßig
einen Admin (`admin@example.de`, Rolle `owner`) und einen Kunden
(`kunde@example.de`, Rolle `member`). Adressen überschreiben:

```bash
SEED_OWNER_EMAIL=ich@meine-domain.de make db-seed
```

Der Seed muss **idempotent** bleiben (`on conflict do update/nothing`), damit er
mehrfach laufen kann. Keine echten Kundendaten, keine Secrets in den Seed.

## Migrationen in Produktion

Beim Deploy läuft `npm run db:migrate` **vor** dem Start der neuen App-Version —
in `docs/DEPLOY.md` ist das für Railway/Render/Fly beschrieben. Zwei Regeln:

- **Erst Migration, dann Deploy.** Neue Spalten zuerst *optional* (nullable) oder
  mit Default anlegen, damit die noch laufende alte Version nicht bricht.
- **Vor riskanten Migrationen ein Backup.** Managed-Postgres-Anbieter machen
  automatische Backups — prüf vor dem Löschen von Spalten/Tabellen, dass eins da ist.

Spalten löschen macht man deshalb in zwei Schritten: erst Code, der sie nicht mehr
benutzt (deployen), dann eine Migration, die sie entfernt.

## Wenn eine Migration fehlschlägt

1. Fehlermeldung lesen — meistens kollidieren vorhandene Daten mit einer neuen
   Regel (z. B. `not null` auf einer Spalte, die schon `NULL`-Werte enthält).
2. Lokal reproduzieren: `make db-reset` und dann mit realistischen Daten testen.
3. Migration reparieren, indem du sie **lokal** neu erzeugst (`make db-generate`),
   solange sie noch nicht ausgeliefert ist. Ist sie schon in Produktion gelaufen,
   schreib eine neue, korrigierende Migration.

## Lokale Postgres

Läuft per Docker (`docker-compose.yml`), Start/Stopp über `make start` / `make stop`.
Ist Port 5432 schon belegt (anderes Projekt, lokal installierte Postgres), setz in
`.env` **beides** — den Port und den Port in der URL:

```bash
DB_PORT=5433
DATABASE_URL=postgresql://app:app@localhost:5433/app
```

`make start` prüft das vorher: Läuft auf dem Port schon eine fremde Datenbank oder
passen `DB_PORT` und `DATABASE_URL` nicht zusammen, bricht es mit einer Erklärung ab,
**bevor** Migrationen in einer fremden Datenbank landen (`scripts/db/up.sh`). Diese
Verwechslung ist der häufigste und unangenehmste lokale Fehler — Projekte aus diesem
Template benutzen alle dieselben Zugangsdaten `app/app/app`, passen also
versehentlich zueinander.
