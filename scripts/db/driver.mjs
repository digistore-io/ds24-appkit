// Which database this machine runs on locally: Docker, or one of our own.
//
// There are exactly two values:
//
//   DB_DRIVER=docker   Postgres 16 in a container (docker-compose.yml). The
//                      one that matches production.
//   DB_DRIVER=local    Postgres 16 started straight from an npm package
//                      (scripts/db/local.mjs). No Docker involved.
//
// **Nobody has to set it.** With no value in .env this file looks at the
// machine: a Docker that actually answers means `docker`, anything else means
// `local`. That is the whole rule — Docker is used where it exists and is not
// a prerequisite where it does not. It is what makes the app startable on a
// Windows machine without Docker Desktop, WSL2 and a restart, and that is the
// point where this template used to lose people.
//
// **The look happens once, and the answer is written into .env.** That is not
// tidiness, it is the safety net: "is Docker there?" is a question whose answer
// changes between two mornings — Docker Desktop that did not start with the
// session looks exactly like a machine that never had it. Deciding afresh every
// time would silently point an existing project at a second, empty database,
// and to the user that reads as "the app forgot everything". So the first run
// decides, .env records it, and every run after that reads the record.
//
// Two more things follow from the same worry:
//
//   - An existing local data directory outranks the look. Whoever has data in
//     .dev/pgdata keeps being served by it, even once Docker shows up later.
//   - An unknown value throws instead of falling back. A typo would otherwise
//     start the wrong database and take the app with it — against an empty one,
//     with every migration "pending" again.
import { existsSync } from "node:fs";
import { readEnvValue, setEnvValue } from "../lib/env-write.mjs";
import { capture, hasCommand } from "../lib/proc.mjs";
import { LOCAL_DATA_DIR } from "./local.mjs";

export const DB_DRIVERS = ["docker", "local"];

/**
 * The driver somebody wrote down — or null when nobody did.
 * Cheap on purpose: no process is started, so the SessionStart hook and every
 * other quick path can ask without paying for a Docker round trip.
 */
export function configuredDriver() {
  const raw = (process.env.DB_DRIVER || readEnvValue(".env", "DB_DRIVER") || "").trim();
  if (!raw) return null;
  if (!DB_DRIVERS.includes(raw)) {
    throw new Error(
      `✗ DB_DRIVER="${raw}" is not a known value.\n` +
        `  Allowed: ${DB_DRIVERS.join(", ")} — set it in .env, or remove the line\n` +
        `  entirely and this machine is looked at instead.\n` +
        `  docker = Postgres in a container, local = without Docker.`,
    );
  }
  return raw;
}

/**
 * Is there a Docker here that would actually run a database?
 * Installed is not the same as running — Docker Desktop in particular installs
 * fine and then sits there switched off, so the daemon is asked, not the PATH.
 */
export async function dockerUsable() {
  if (!(await hasCommand("docker"))) return false;
  const info = await capture("docker", ["info", "--format", "{{.ServerVersion}}"]);
  return info.code === 0;
}

// One look per process. `node run.mjs start` asks through db-up, status and the
// stop path, and `docker info` is not free on any of the three systems.
let detected = null;

/**
 * The driver in force. Resolves the question once and remembers the answer —
 * in .env when there is one, otherwise for the rest of this process.
 */
export async function dbDriver() {
  const chosen = configuredDriver();
  if (chosen) return chosen;
  if (detected) return detected;

  // Data beats detection: a database that already exists keeps its driver.
  detected = existsSync(LOCAL_DATA_DIR) || !(await dockerUsable()) ? "local" : "docker";

  // Written down so the next run does not have to ask again — and so the answer
  // cannot change under a project that already has data in it.
  if (existsSync(".env")) setEnvValue(".env", "DB_DRIVER", detected);
  return detected;
}

/** True when the local database runs without Docker. */
export const usesLocalPostgres = async () => (await dbDriver()) === "local";
