#!/usr/bin/env node
// Listet App-Benutzer mit ihrer Rolle (nur lesend — kein --apply).
//
// Nutzung:
//   node scripts/users/list-users.mjs
//   node scripts/users/list-users.mjs --role owner   # nur owner filtern
import { parseArgs, resolveRole, connect } from "./_db.mjs";

const args = parseArgs(process.argv.slice(2));
const roleFilter = args.role === undefined ? null : resolveRole(args.role);
if (args.role !== undefined && roleFilter === null) {
  console.error("FEHLER: ungültige Rolle für --role (owner|member).");
  process.exit(2);
}

const sql = connect();
try {
  const rows = roleFilter
    ? await sql`select email, role, name from users where role = ${roleFilter} order by role desc, email`
    : await sql`select email, role, name from users order by role desc, email`;

  if (rows.length === 0) {
    console.log("Keine Benutzer gefunden.");
  } else {
    for (const r of rows) {
      console.log(`${r.role.padEnd(7)}  ${r.email ?? "(keine E-Mail)"}`);
    }
    console.log(`\n${rows.length} Benutzer.`);
  }
} catch (e) {
  console.error("FEHLER beim Lesen der DB:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
