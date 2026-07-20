#!/usr/bin/env node
// Legt einen App-Benutzer an oder setzt dessen Rolle (idempotent per E-Mail).
//
// Zweck: Der Betreiber braucht einen Login mit erhöhter Rolle ("owner" = Admin),
// bevor er sich per E-Mail-Magic-Link einloggt. Existiert die users-Zeile schon
// (hier angelegt), verwendet der Login sie wieder — der Betreiber ist dann owner.
//
// Nutzung:
//   node scripts/users/create-user.mjs --email chef@example.de --role owner
//   node scripts/users/create-user.mjs --email chef@example.de --role owner --apply
//   node scripts/users/create-user.mjs --email kunde@example.de            # Default: member
//
// Rollen: owner|member (Aliase: admin→owner, user→member). Default: member.
// Dry-Run ist Standard. Zum Ausführen: --apply
import { randomUUID } from "node:crypto";
import { parseArgs, resolveRole, connect, CANONICAL_ROLES } from "./_db.mjs";

const args = parseArgs(process.argv.slice(2));
const apply = Boolean(args.apply);

const email =
  typeof args.email === "string" ? args.email.trim().toLowerCase() : null;
if (!email || !email.includes("@")) {
  console.error('FEHLER: gültige --email "<adresse>" erforderlich.');
  process.exit(2);
}

// Ohne --role: Default "member". Mit --role: validieren/normalisieren.
const role = args.role === undefined ? "member" : resolveRole(args.role);
if (role === null) {
  console.error(
    `FEHLER: ungültige Rolle. Erlaubt: ${CANONICAL_ROLES.join(", ")} ` +
      "(Aliase: admin, user).",
  );
  process.exit(2);
}

const name = typeof args.name === "string" ? args.name : null;

if (!apply) {
  console.log("DRY-RUN — es würde folgender Benutzer angelegt/aktualisiert:");
  console.log(JSON.stringify({ email, role, name }, null, 2));
  console.log("\nZum Ausführen erneut mit --apply aufrufen.");
  process.exit(0);
}

const sql = connect();
try {
  // Upsert nach E-Mail: neu anlegen oder Rolle/Name aktualisieren.
  const [row] = await sql`
    insert into users (id, email, name, role)
    values (${randomUUID()}, ${email}, ${name}, ${role})
    on conflict (email) do update set
      role = excluded.role,
      name = coalesce(excluded.name, users.name)
    returning email, role, name
  `;
  console.log(
    `✓ Benutzer gesetzt: ${row.email} (Rolle: ${row.role}` +
      (row.name ? `, Name: ${row.name}` : "") +
      ")",
  );
  if (row.role === "owner") {
    console.log(
      "  → owner = Admin/Betreiber. Login jetzt per E-Mail-Magic-Link unter /login.",
    );
  }
} catch (e) {
  console.error("FEHLER beim Schreiben in die DB:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
