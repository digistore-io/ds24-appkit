# Deployment

Das Template baut ein eigenständiges Artefakt (`output: "standalone"`) und läuft
auf jedem Node-Hoster. Hier die drei einfachsten Wege. Überall gilt:

**Diese Umgebungsvariablen setzen** (Werte aus `.env.example`):
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `APP_URL` (deine Domain)
und mindestens einen Auth-Provider (`GOOGLE_*` oder `AUTH_RESEND_KEY`+`EMAIL_FROM`).

Nach dem ersten Deploy einmalig das Schema anlegen: `npm run db:migrate`.
Bei jedem weiteren Deploy laufen die Migrationen **vor** dem Start der neuen
Version — Hintergrund und Regeln: [`database.md`](database.md). `db:push` hat in
Produktion nichts zu suchen.

---

## Railway (am einfachsten)

1. Neues Projekt → „Deploy from GitHub repo" → dein Repo wählen.
2. Plugin **PostgreSQL** hinzufügen → Railway setzt `DATABASE_URL` automatisch.
3. Unter *Variables* die restlichen Env-Variablen eintragen.
4. Deploy. Danach in Railway-Shell `npm run db:migrate`.

## Render

1. **New → Web Service**, Repo verbinden. Build: `npm install && npm run build`,
   Start: `npm run start`.
2. **New → PostgreSQL** anlegen, dessen Connection-String als `DATABASE_URL` setzen.
3. Übrige Env-Variablen eintragen, deploy, dann `npm run db:migrate`.

## Fly.io

1. `fly launch` (erkennt Next.js). Postgres: `fly postgres create` und
   `fly postgres attach` → setzt `DATABASE_URL`.
2. Secrets: `fly secrets set AUTH_SECRET=… GOOGLE_CLIENT_ID=… …`
3. `fly deploy`, danach `fly ssh console -C "npm run db:migrate"`.

---

## Digistore24 verbinden

1. Im Terminal `make ds24-connect` ausführen. Der Browser öffnet sich, du
   bestätigst bei Digistore24 — der API-Key landet in deiner lokalen `.env`
   (`DIGISTORE_API_KEY`, dazu `DIGISTORE_IPN_PASSPHRASE`, sofern Digistore24 sie
   mitliefert). Es gibt bewusst **keine** Oberfläche zum Eintragen von Schlüsseln.
2. `make ds24-sync ARGS=--apply` ausführen. Legt die Produkte an **und**
   registriert die IPN-Anbindung per API bei Digistore24 (URL immer
   `https://DEINE-DOMAIN/api/ipn`, Signatur SHA512) — sofern `APP_URL` auf die
   öffentliche Domain zeigt. Die erzeugte Passphrase und die stabile
   `DIGISTORE_IPN_DOMAIN_ID` landen in der `.env`. In der DS24-Oberfläche muss
   dafür **nichts** von Hand eingetragen werden.
3. Die relevanten Secrets beim Hoster hinterlegen (nicht ins Repo):
   `DIGISTORE_API_KEY`, `DIGISTORE_IPN_PASSPHRASE`, `DIGISTORE_IPN_DOMAIN_ID`.
4. In Digistore24 „Verbindung testen" auslösen → der IPN muss mit `200` antworten.
