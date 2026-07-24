// Picks the port that `node run.mjs start` will start the app on.
//
// If the wanted port is taken (another project, a second app), the next free
// one is used — instead of aborting the start and making the user enter a port
// by hand. APP_URL in .env is carried along, so that sign-in links and
// redirects point at the same address as the running app.
//
// The chosen port is remembered in .dev/port, so that every later command
// (stop, status, logs, smoke) hits this app and not another project's.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { freePort, portInUse, urlSetPort } from "./ports.mjs";
import { readEnvValue, setEnvValue } from "../lib/env-write.mjs";

export const DEV_DIR = ".dev";
export const PORT_FILE = `${DEV_DIR}/port`;

/** The port remembered by an earlier start, or null. */
export function rememberedPort() {
  if (!existsSync(PORT_FILE)) return null;
  const value = Number.parseInt(readFileSync(PORT_FILE, "utf8").trim(), 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Decide the app port, write it to .dev/port and return it.
 * Throws if the wanted port is held by an instance of THIS project.
 */
export async function chooseAppPort(wanted = 3000) {
  let port = wanted;

  if (await portInUse(port)) {
    // If an earlier instance of THIS project holds the port (e.g. because
    // .dev/dev.pid went missing after a crash), falling back would be wrong:
    // the same app would then run twice and nobody would notice. The remembered
    // port gives it away.
    if (rememberedPort() === port) {
      const alternative = await freePort(port + 1);
      throw new Error(
        `✗ Port ${port} still hosts an instance of this project.\n` +
          `  Stop it first:               node run.mjs stop\n` +
          `  Or run alongside on purpose: node run.mjs start --port ${alternative}`,
      );
    }
    port = await freePort(port + 1);
    console.log(`ℹ Port ${wanted} is taken (another project?) — the app runs on ${port}.`);
  }

  // Only touch APP_URL if it points at the local machine: in STAGING/PROD it
  // holds the real domain, which has nothing to do with the local port.
  const appUrl = readEnvValue(".env", "APP_URL");
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:|$)/.test(appUrl)) {
    const updated = urlSetPort(appUrl, port);
    if (updated !== appUrl) {
      setEnvValue(".env", "APP_URL", updated);
      console.log(`  APP_URL in .env set to ${updated}.`);
    }
  }

  mkdirSync(DEV_DIR, { recursive: true });
  writeFileSync(PORT_FILE, `${port}\n`);
  return port;
}
