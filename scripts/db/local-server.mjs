// The local Postgres, without Docker — the process that holds it open.
//
// This script is NOT called by hand. `scripts/db/local.mjs` spawns it detached
// and remembers its PID, exactly as `scripts/dev/app.mjs` does with the dev
// server. It exists as a file of its own because the npm package we use here
// keeps Postgres as a CHILD of the Node process that started it and shuts it
// down when that process exits. `node run.mjs start` has to return, so the
// process that must stay is this one — not the command the user typed.
//
// It ends on SIGTERM, and it ends cleanly: Postgres is stopped first, then we
// exit. A killed Postgres replays its WAL on the next start, which works, but
// costs seconds and writes alarming lines into a log people read when they are
// already looking for a problem.
//
// Everything it needs comes on the command line — the caller has already read
// .env and is the one place that parses DATABASE_URL.
import EmbeddedPostgres from "embedded-postgres";

const [, , dataDir, portArg, user, password, database] = process.argv;
const port = Number(portArg);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user,
  password,
  authMethod: "scram-sha-256",
  // Never delete the data on stop — this is somebody's development database,
  // and `stop` is what happens at the end of every working day.
  persistent: true,
  onLog: (message) => process.stdout.write(`${message}\n`),
  onError: (message) => process.stderr.write(`${message}\n`),
});

// An existing cluster is initialised already; initdb would refuse a second time.
const { existsSync } = await import("node:fs");
if (!existsSync(`${dataDir}/PG_VERSION`)) {
  console.log(`→ Creating the database cluster in ${dataDir} (once).`);
  await pg.initialise();
}

await pg.start();

// The cluster brings a database called `postgres`; the app wants its own.
// Idempotent: on every start after the first this simply already exists.
if (database && database !== "postgres") {
  try {
    await pg.createDatabase(database);
    console.log(`→ Database "${database}" created.`);
  } catch {
    /* already there — the normal case from the second start on */
  }
}

console.log(`✓ Postgres is listening on port ${port}.`);

let stopping = false;
const shutDown = async () => {
  if (stopping) return;
  stopping = true;
  try {
    await pg.stop();
  } catch (error) {
    console.error(`Postgres did not stop cleanly: ${error.message}`);
  }
  process.exit(0);
};

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
