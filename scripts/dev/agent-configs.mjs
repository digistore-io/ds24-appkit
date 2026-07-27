// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// Which program needs which files, and what is in them.
//
// This app ships wired for all four. That is what makes "it works out of the
// box" literally true — a fresh clone opened in any of them greets you before a
// single command has run. `node run.mjs agent-setup` then reduces the clone to
// the one actually in use, and can put the others back.
//
// So this module is the single source for both directions: the factory
// generates the shipped config files from it (scripts/agent-configs-stamp.mjs),
// and agent-setup restores from it after a prune. Two callers, one definition —
// otherwise "put it back" would put back something slightly different.
//
// ── What is NOT in here, and why ────────────────────────────────────────────
//
//   scripts/dev/session-start.mjs   the greeting itself. Shared by all four, so
//                                   it is never pruned and never restored.
//   .claude/skills/**               the real skills. OpenCode and Claude Code
//                                   read them directly, and the .agents/ stubs
//                                   point at them — so they stay, always, for
//                                   every program.
//
// Only the wiring is per-program. The substance is shared.

/**
 * The one line of shell in this project, repeated per program.
 *
 * The greeting is a Node script, so on a machine without Node it cannot run and
 * cannot say why — it prints nothing, and nothing reads as "all fine". This asks
 * the question in a language that is there before Node is. CLAUDE.md → Three
 * systems calls it the single deliberate exception to "no bash": it starts no
 * process and finds no process.
 */
export const NODE_PROBE =
  "if ! command -v node > /dev/null 2>&1; then echo '[Setup: blocked — node. " +
  "Node.js is not installed on this machine, so the greeting below could not run. " +
  "Run the skill setup-machine BEFORE writing any code.]'; fi";

/** The greeting every program runs at session start. */
export const GREETER = "node scripts/dev/session-start.mjs";

const claudeSettings = `{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": ${JSON.stringify(NODE_PROBE)}
          },
          {
            "type": "command",
            "command": ${JSON.stringify(GREETER)}
          }
        ]
      }
    ]
  }
}
`;

const geminiSettings = `{
  "context": {
    "fileName": ["AGENTS.md", "GEMINI.md"]
  },
  "hooks": {
    "SessionStart": [
      {
        "command": ${JSON.stringify(NODE_PROBE)}
      },
      {
        "command": ${JSON.stringify(GREETER)}
      }
    ]
  }
}
`;

// Codex keeps hooks behind a feature flag and reads them from the same
// config.toml. The probe runs first for the same reason it does everywhere else.
const codexConfig = `# Codex reads AGENTS.md by itself — the only thing it needs from us is the
# greeting, and the flag that turns hooks on at all.

[features]
codex_hooks = true

[[hooks.SessionStart]]
command = ${JSON.stringify(NODE_PROBE)}

[[hooks.SessionStart]]
command = ${JSON.stringify(GREETER)}
`;

// OpenCode has no declarative hooks yet (opencode#14863), only plugins — so this
// is the one program whose greeting is code we ship rather than a line of
// config, and therefore the only one that could take a session down with it.
// Everything is wrapped: the situation it exists to report (no node on this
// machine) is exactly the one in which it fails.
const opencodePlugin = `// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

// The session greeting, for OpenCode. Generated from
// scripts/dev/agent-configs.mjs — edit it there, not here.
//
// It runs the same scripts/dev/session-start.mjs as the other three. Spawned
// rather than imported: a child process cannot take OpenCode down with it, and
// the greeting must never be the reason somebody cannot start work.
//
// Node and not bash, like everything else that has to run on Linux, macOS and
// Windows alike (CLAUDE.md → Three systems).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const SessionGreeting = async ({ directory }) => {
  let done = false;

  async function greet() {
    if (done) return;
    done = true;

    try {
      const { stdout } = await run("node", ["scripts/dev/session-start.mjs"], {
        cwd: directory ?? process.cwd(),
        timeout: 15_000,
      });
      if (stdout.trim()) console.log(stdout.trimEnd());
    } catch (error) {
      // The one case worth a word: no node on this machine. Everything else
      // stays quiet — a broken greeting must not look like a broken project.
      if (error?.code === "ENOENT") {
        console.log(
          "[Setup: blocked — node. Node.js is not installed on this machine, so the " +
            "greeting could not run. Run the skill setup-machine BEFORE writing any code.]",
        );
      }
    }
  }

  // Registered twice on purpose. OpenCode's documented shape is a hook keyed by
  // the event name; a generic "event" hook is also described in the wild. Which
  // one is live is not something this file can find out, and the failure mode of
  // guessing wrong is the worst one available: no greeting, no error, and a
  // machine that may have no Node reading as "all fine". The done flag makes the
  // duplicate harmless — whichever fires first wins, the other returns.
  return {
    "session.created": () => greet(),
    event: async ({ event }) => {
      if (event?.type === "session.created") await greet();
    },
  };
};
`;

/**
 * The four programs, what each one needs, and how to tell you are in it.
 *
 * `stubs` says whether this program needs .agents/skills/. Claude Code and
 * OpenCode read .claude/skills/ directly and do not.
 *
 * `detect` is a best-effort read of the environment, never the mechanism: the
 * program running `agent-setup` knows what it is and should pass --agent. Env
 * detection is for a human running it by hand.
 */
export const AGENTS = {
  claude: {
    label: "Claude Code",
    detect: (env) => Boolean(env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT),
    stubs: false,
    files: { ".claude/settings.json": claudeSettings },
  },
  codex: {
    label: "OpenAI Codex CLI",
    detect: (env) => Boolean(env.CODEX_SANDBOX || env.CODEX_HOME || env.CODEX_SESSION_ID),
    stubs: true,
    files: { ".codex/config.toml": codexConfig },
  },
  gemini: {
    label: "Gemini CLI",
    detect: (env) => Boolean(env.GEMINI_CLI || env.GEMINI_SESSION_ID || env.GEMINI_PROJECT_DIR),
    stubs: true,
    files: { ".gemini/settings.json": geminiSettings },
  },
  opencode: {
    label: "OpenCode",
    detect: (env) => Boolean(env.OPENCODE || env.OPENCODE_BIN_PATH || env.OPENCODE_SESSION_ID),
    stubs: false,
    files: { ".opencode/plugins/session-start.js": opencodePlugin },
  },
};

/** Every config file this template ships, whoever it belongs to. */
export function allConfigFiles() {
  return Object.entries(AGENTS).flatMap(([agent, { files }]) =>
    Object.entries(files).map(([file, content]) => ({ agent, file, content })),
  );
}


/** Where the .agents/skills stubs live — the one prune entry that is a folder. */
export const STUB_TREE = ".agents/skills";

/**
 * What an app set up for `agent` should NOT have.
 *
 * Config files by their exact path, never by their folder. `.claude` as a
 * prefix would swallow `.claude/skills/**` — which is in the knowledge stamp and
 * belongs to every program — and `node run.mjs update` would silently stop
 * updating all seventeen skills. The stub tree is the one folder entry, because
 * a later release adds stubs that do not exist here yet.
 */
export function prunedPathsFor(agent) {
  const paths = new Set();
  for (const [name, { files }] of Object.entries(AGENTS)) {
    if (name === agent) continue;
    for (const file of Object.keys(files)) paths.add(file);
  }
  if (!AGENTS[agent].stubs) paths.add(STUB_TREE);
  return [...paths].sort();
}

/** Which program is this, as far as the environment gives it away? */
export function detectAgent(env = process.env) {
  const hits = Object.keys(AGENTS).filter((name) => AGENTS[name].detect(env));
  return hits.length === 1 ? hits[0] : null;
}
