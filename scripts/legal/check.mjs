// What is still missing before this app may meet a customer.
//
//   node run.mjs legal-check
//
// The counterpart to `ai-check`, `mcp-check` and `kb-check`, for the
// obligations in `docs/compliance.md`. Without a command like this the whole
// subject is an intention: a placeholder Impressum, a consent purpose with no
// wording behind it and a retention job that has never run all look exactly
// like a finished app from the outside.
//
// It reports; it never writes. The skill `compliance-check` is what fixes
// things, and `go-live` runs this before the app goes public.
//
// Plain Node, no bundler, no TypeScript, no dependency — Linux, macOS and Git
// Bash on Windows (CLAUDE.md, "Three systems").
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The marker a shipped placeholder carries — mirrors lib/legal/pages.ts. */
const PLACEHOLDER_MARKER = "<!-- ds24-appkit:placeholder -->";

/** Mirrors LEGAL_SLUGS in lib/legal/pages.ts. */
const LEGAL_SLUGS = ["impressum", "datenschutz", "agb", "widerruf"];

/** The two that are required of every app, whoever sells. */
const ALWAYS_REQUIRED = ["impressum", "datenschutz"];

/** The evidence pack `compliance-check` writes. See docs/compliance.md §1.3. */
const EVIDENCE = [
  ["verarbeitungsverzeichnis.md", "record of processing activities (Art. 30)"],
  ["tom.md", "technical and organisational measures (Art. 32)"],
  ["loeschkonzept.md", "deletion concept (Art. 5(1)(e), 17)"],
  ["avv-register.md", "processor agreements (Art. 28)"],
  ["ki-register.md", "AI systems, roles and Art. 50 measures"],
  ["ki-kompetenz.md", "AI literacy measures (Art. 4 AI Act)"],
  ["datenpanne.md", "data breach procedure (Art. 33, 34)"],
];

let problems = 0;
let warnings = 0;

const fail = (what, why) => {
  problems++;
  console.log(`  ❌ ${what}\n     ${why}`);
};
const warn = (what, why) => {
  warnings++;
  console.log(`  ⚠️  ${what}\n     ${why}`);
};
const ok = (what) => console.log(`  ✓ ${what}`);

function readJson(relative) {
  try {
    return JSON.parse(readFileSync(join(ROOT, relative), "utf8"));
  } catch {
    return null;
  }
}

function locales() {
  const dir = join(ROOT, "messages");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

// ── 1. The legal pages ─────────────────────────────────────────────────────
console.log("\nLegal pages (content/legal/)");

const legalDir = join(ROOT, "content", "legal");
const written = [];

for (const slug of LEGAL_SLUGS) {
  const files = locales()
    .map((locale) => ({ locale, path: join(legalDir, `${slug}.${locale}.md`) }))
    .filter((f) => existsSync(f.path));

  if (files.length === 0) {
    if (ALWAYS_REQUIRED.includes(slug)) {
      fail(
        `/${slug} does not exist`,
        `Every app needs one, whoever sells. Run the skill compliance-check.`,
      );
    }
    // AGB and Widerruf are deliberately absent where Digistore24 resells —
    // saying nothing is the correct report, not a gap.
    continue;
  }

  written.push(slug);

  const placeholders = files.filter((f) =>
    readFileSync(f.path, "utf8").includes(PLACEHOLDER_MARKER),
  );

  if (placeholders.length === files.length) {
    fail(
      `/${slug} is still the shipped placeholder`,
      `It says so on the page, in a warning box, to every visitor. ` +
        `Run the skill compliance-check to write the real text.`,
    );
  } else if (placeholders.length > 0) {
    warn(
      `/${slug} is filled in for ${files.length - placeholders.length} of ${files.length} languages`,
      `Still a placeholder: ${placeholders.map((f) => f.locale).join(", ")}. ` +
        `The page falls back to the language that exists, so nobody sees a ` +
        `broken page — they see a finished policy in the wrong language.`,
    );
  } else {
    ok(`/${slug} (${files.map((f) => f.locale).join(", ")})`);
  }
}

// ── 2. The AI disclosure ───────────────────────────────────────────────────
console.log("\nAI transparency (Art. 50(1) EU AI Act, since 2 August 2026)");

const chat = readJson("config/ai-chat.json");

if (!chat || chat.enabled !== true) {
  ok("the assistant is switched off — nothing to disclose");
} else {
  // How each language names a machine. Mirrors lib/ai/disclosure.test.ts, which
  // fails the build on the same rule; this says it in a sentence instead of in
  // an assertion, at the moment somebody is asking whether they may go live.
  const NAMES_A_MACHINE = {
    de: /\bKI\b|\bkünstliche[rn]? Intelligenz\b/i,
    en: /\bAI\b|\bartificial intelligence\b/i,
  };

  for (const locale of locales()) {
    const messages = readJson(`messages/${locale}.json`);
    const line = messages?.chat?.disclaimer;
    const pattern = NAMES_A_MACHINE[locale];

    if (!line) {
      fail(
        `${locale}: chat.disclaimer is missing`,
        `The assistant is on, so people must be told they are talking to a ` +
          `machine at the latest at the first interaction.`,
      );
    } else if (pattern && !pattern.test(line)) {
      fail(
        `${locale}: chat.disclaimer no longer says it is an AI`,
        `"${line}"`,
      );
    } else if (!pattern) {
      warn(
        `${locale}: cannot check chat.disclaimer automatically`,
        `No word pattern for this language. Read it yourself: "${line}"`,
      );
    } else {
      ok(`${locale}: "${line}"`);
    }
  }
}

// ── 3. Consent ─────────────────────────────────────────────────────────────
console.log("\nConsent (config/consent.json)");

const consent = readJson("config/consent.json");
const purposes = Array.isArray(consent?.purposes) ? consent.purposes : [];

if (!consent) {
  fail(
    "config/consent.json is missing or unreadable",
    "An unreadable file means no purposes at all, so anything gated on a " +
      "consent stays off. That is the safe direction, but it is not what you meant.",
  );
} else if (purposes.length === 0) {
  ok(
    "no purposes declared — correct as long as this app adds no tracking " +
      "and sends no marketing mail",
  );
} else {
  for (const purpose of purposes) {
    const key = purpose?.key;
    if (typeof key !== "string") {
      fail("a purpose has no key", JSON.stringify(purpose));
      continue;
    }
    if (!purpose?.textVersion) {
      fail(
        `purpose "${key}" has no textVersion`,
        `Without it, a consent given to the old wording silently counts as ` +
          `covering the new one.`,
      );
    }
    // The check an operator actually trips over: a purpose declared, the
    // wording forgotten, and the dialog rendering "consent.marketing_email.title"
    // at a customer.
    for (const locale of locales()) {
      const messages = readJson(`messages/${locale}.json`);
      for (const part of ["title", "body"]) {
        if (typeof messages?.consent?.[key]?.[part] !== "string") {
          fail(
            `${locale}: consent.${key}.${part} is missing`,
            `The dialog would show the key itself to a customer.`,
          );
        }
      }
    }
  }
  if (problems === 0) ok(`${purposes.length} purpose(s) declared, all with wording`);
}

// ── 4. The evidence pack ───────────────────────────────────────────────────
console.log("\nEvidence (docs/compliance/) — GDPR Art. 5(2), accountability");

const evidenceDir = join(ROOT, "docs", "compliance");
const missing = EVIDENCE.filter(([file]) => !existsSync(join(evidenceDir, file)));

if (missing.length === EVIDENCE.length) {
  warn(
    "none of the evidence documents exist yet",
    `Accountability means being able to SHOW compliance, not only achieve it. ` +
      `Run the skill compliance-check — it writes them from what the code ` +
      `actually does rather than from a template.`,
  );
} else if (missing.length > 0) {
  for (const [file, what] of missing) warn(`docs/compliance/${file} is missing`, what);
  ok(`${EVIDENCE.length - missing.length} of ${EVIDENCE.length} written`);
} else {
  ok(`all ${EVIDENCE.length} written`);
}

// ── 5. Do the retention jobs actually run? ─────────────────────────────────
// The retention windows in a privacy policy are promises. This is the only
// check here that asks the database rather than the filesystem, because it is
// the only one whose answer is not on disk — and "last run: never" means the
// sentence you published is not describing what your app does.
console.log("\nRetention (the promises in your privacy policy)");

try {
  const { connect } = await import("../users/_db.mjs");
  const sql = connect();
  try {
    // Column names from db/schema-cron.ts: the primary key is `job`, and the
    // outcome is the text "ok" | "failed".
    const rows = await sql`select job, last_finished_at, last_outcome from cron_runs`;
    const byId = new Map(rows.map((r) => [r.job, r]));

    // `config/cron.json` keys its jobs by id — an OBJECT, not an array.
    const config = readJson("config/cron.json");
    const jobs = config?.jobs && typeof config.jobs === "object" ? config.jobs : {};
    const pruning = Object.entries(jobs).filter(
      ([id, job]) => id.startsWith("prune-") && job?.enabled !== false,
    );

    if (pruning.length === 0) {
      ok("no retention jobs enabled");
    } else {
      for (const [id] of pruning) {
        const row = byId.get(id);
        if (!row?.last_finished_at) {
          warn(
            `${id} has never run`,
            `Nothing is being deleted. If your privacy policy names a retention ` +
              `period, it is not currently true. Force one: node run.mjs cron --job ${id}`,
          );
        } else if (row.last_outcome === "failed") {
          fail(`${id} last failed`, `node run.mjs cron --list for the detail.`);
        } else {
          ok(
            `${id} last ran ${new Date(row.last_finished_at).toISOString().slice(0, 16)}`,
          );
        }
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
} catch {
  // A database that is not up is not a compliance finding — it is a machine
  // that is off. Everything above still answered.
  console.log(
    "  … skipped: the database did not answer. Start the app and run this again.",
  );
}

// ── Verdict ────────────────────────────────────────────────────────────────
console.log("");
if (problems > 0) {
  console.log(
    `❌ ${problems} thing(s) must be fixed before this app meets a customer` +
      (warnings > 0 ? `, and ${warnings} worth looking at.` : "."),
  );
  console.log("   The guided path is the skill: compliance-check\n");
  process.exit(1);
}
if (warnings > 0) {
  console.log(`⚠️  ${warnings} thing(s) worth looking at. Nothing blocking.\n`);
} else {
  console.log("✓ Nothing missing.\n");
}
