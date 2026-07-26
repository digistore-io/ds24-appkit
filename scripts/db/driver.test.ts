// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The database driver decides itself — these are the cases it has to get right.
//
// Why this is worth a test file of its own: the decision is invisible. Every
// wrong answer here still starts *a* database and still looks like a working
// app — it is simply the wrong one, and what the user sees is an empty project
// where their data used to be. There is no error message to notice.
//
// The machine is faked wholesale (Docker, the data directory, .env), because
// the whole point is the cases that cannot be reproduced on the machine this
// runs on: nobody has a laptop that has Docker and does not.
import { beforeEach, describe, expect, it, vi } from "vitest";

/** The machine each case pretends to be. */
const machine = {
  dockerInstalled: false,
  dockerRunning: false,
  localData: false,
  envFile: true,
  env: {} as Record<string, string>,
  written: [] as [string, string][],
  probes: 0,
};

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: (target: unknown) => {
      const file = String(target);
      if (file === ".env") return machine.envFile;
      if (file.endsWith("pgdata")) return machine.localData;
      return actual.existsSync(target as string);
    },
  };
});

vi.mock("../lib/proc.mjs", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    hasCommand: async (command: string) => {
      if (command !== "docker") return true;
      machine.probes += 1;
      return machine.dockerInstalled;
    },
    capture: async () => ({ code: machine.dockerRunning ? 0 : 1, stdout: "", stderr: "" }),
  };
});

vi.mock("../lib/env-write.mjs", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    readEnvValue: (_file: string, key: string) => machine.env[key] ?? "",
    setEnvValue: (_file: string, key: string, value: string) => {
      machine.written.push([key, value]);
    },
  };
});

/** A fresh module per case — it remembers its answer for the process. */
async function driverModule() {
  vi.resetModules();
  return await import("./driver.mjs");
}

beforeEach(() => {
  machine.dockerInstalled = false;
  machine.dockerRunning = false;
  machine.localData = false;
  machine.envFile = true;
  machine.env = {};
  machine.written = [];
  machine.probes = 0;
  delete process.env.DB_DRIVER;
});

describe("with nothing written down, the machine decides", () => {
  it("uses Docker where Docker answers", async () => {
    machine.dockerInstalled = true;
    machine.dockerRunning = true;
    const { dbDriver } = await driverModule();
    expect(await dbDriver()).toBe("docker");
  });

  it("uses the npm Postgres where there is no Docker", async () => {
    const { dbDriver } = await driverModule();
    expect(await dbDriver()).toBe("local");
  });

  // Docker Desktop installs fine and then sits there switched off. Counting
  // that as "Docker is here" would hand the user a database that never starts.
  it("uses the npm Postgres when Docker is installed but not running", async () => {
    machine.dockerInstalled = true;
    machine.dockerRunning = false;
    const { dbDriver } = await driverModule();
    expect(await dbDriver()).toBe("local");
  });

  // The one that turns a wrong guess into data loss: this project already runs
  // without Docker, and a Docker showing up later must not move it.
  it("leaves a project that already has local data where it is", async () => {
    machine.localData = true;
    machine.dockerInstalled = true;
    machine.dockerRunning = true;
    const { dbDriver } = await driverModule();
    expect(await dbDriver()).toBe("local");
  });

  it("writes the answer into .env, so it is decided once and not every morning", async () => {
    machine.dockerInstalled = true;
    machine.dockerRunning = true;
    const { dbDriver } = await driverModule();
    await dbDriver();
    expect(machine.written).toEqual([["DB_DRIVER", "docker"]]);
  });

  it("still answers when there is no .env yet, and writes nothing", async () => {
    machine.envFile = false;
    const { dbDriver } = await driverModule();
    expect(await dbDriver()).toBe("local");
    expect(machine.written).toEqual([]);
  });

  it("looks at Docker once, however often it is asked", async () => {
    const { dbDriver, usesLocalPostgres } = await driverModule();
    await dbDriver();
    await usesLocalPostgres();
    await dbDriver();
    expect(machine.probes).toBe(1);
  });
});

describe("a written-down driver is obeyed", () => {
  it.each(["docker", "local"] as const)("takes %s from .env", async (value) => {
    machine.env.DB_DRIVER = value;
    const { dbDriver } = await driverModule();
    expect(await dbDriver()).toBe(value);
  });

  it("takes the environment over .env", async () => {
    machine.env.DB_DRIVER = "local";
    process.env.DB_DRIVER = "docker";
    const { dbDriver } = await driverModule();
    expect(await dbDriver()).toBe("docker");
  });

  // No probe, no write: the question has been answered, and asking Docker again
  // costs a round trip on every single command.
  it("neither looks at the machine nor writes anything", async () => {
    machine.env.DB_DRIVER = "local";
    const { dbDriver } = await driverModule();
    await dbDriver();
    expect(machine.probes).toBe(0);
    expect(machine.written).toEqual([]);
  });

  // A typo must not fall back to a default — that would start the other
  // database against an empty volume, with every migration "pending" again.
  it("refuses a value it does not know", async () => {
    machine.env.DB_DRIVER = "postgres";
    const { dbDriver } = await driverModule();
    await expect(dbDriver()).rejects.toThrow(/not a known value/);
  });

  it("treats an empty value as nothing written down", async () => {
    machine.env.DB_DRIVER = "";
    const { configuredDriver } = await driverModule();
    expect(configuredDriver()).toBeNull();
  });
});
