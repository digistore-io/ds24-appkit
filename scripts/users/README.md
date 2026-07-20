# Benutzer & Rollen — CLI

Kleine, **idempotente** Skripte, um App-Benutzer anzulegen und Rollen zu vergeben.
Reines Node ESM — kein Build nötig. Können manuell oder von Claude Code ausgeführt
werden (z. B. im Skill `build-app`, wenn der Betreiber-Account eingerichtet wird).

## Voraussetzung (Env)

```bash
export DATABASE_URL="postgresql://…"   # dieselbe DB wie die App (siehe .env)
# lokal: `docker compose up -d` startet Postgres
```

## Rollen

Die `users`-Tabelle hat ein `role`-Feld (siehe `db/schema.ts`):

- **`owner`** — SAAS-Betreiber (Admin). Zugriff auf Admin-Bereiche (`requireOwner()`).
- **`member`** — normaler Kunde (Default beim Selbst-Login).

`--role` akzeptiert die Aliase `admin` (→ `owner`) und `user` (→ `member`).

## Benutzer anlegen / Rolle setzen (Upsert per E-Mail)

```bash
# Dry-Run (zeigt nur, was passieren würde):
node scripts/users/create-user.mjs --email chef@example.de --role owner

# Ausführen (anlegen ODER Rolle einer bestehenden E-Mail ändern):
node scripts/users/create-user.mjs --email chef@example.de --role owner --apply

# Optional mit Name; ohne --role wird "member" gesetzt:
node scripts/users/create-user.mjs --email kunde@example.de --name "Max K." --apply
```

Der Betreiber loggt sich danach unter `/login` per **E-Mail-Magic-Link** ein — die
vorab angelegte Zeile wird wiederverwendet, er ist also sofort `owner`.

## Benutzer auflisten

```bash
node scripts/users/list-users.mjs            # alle
node scripts/users/list-users.mjs --role owner
```

## Über Makefile (aus dem Repo-Root)

```bash
make user-create ARGS='--email chef@example.de --role owner --apply'
make user-list   ARGS='--role owner'
```

Dry-Run ist Standard; erst `--apply` schreibt. `create-user.mjs` ist idempotent
(Upsert nach E-Mail), `list-users.mjs` ist nur lesend.
