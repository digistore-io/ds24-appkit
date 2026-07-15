# Deployment

Das Template baut ein eigenständiges Artefakt (`output: "standalone"`) und läuft
auf jedem Node-Hoster. Hier die drei einfachsten Wege. Überall gilt:

**Diese Umgebungsvariablen setzen** (Werte aus `.env.example`):
`DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `APP_URL` (deine Domain)
und mindestens einen Auth-Provider (`GOOGLE_*` oder `AUTH_RESEND_KEY`+`EMAIL_FROM`).

Nach dem ersten Deploy einmalig das Schema anlegen: `npm run db:migrate`
(oder lokal gegen die Prod-`DATABASE_URL`: `npm run db:push`).

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

1. In der App anmelden → **Onboarding** öffnen.
2. Digistore24 REST-API-Key eintragen (Digistore24 → Einstellungen → API).
3. Die angezeigte **IPN-URL** (`https://DEINE-DOMAIN/api/ipn/<vendor>`) und die
   **Passphrase** in Digistore24 unter *Einstellungen → IPN* hinterlegen
   (Signatur: **SHA512**).
4. In Digistore24 „Verbindung testen" auslösen → Status wird in der App grün.
