// Checks the AI layer — which task runs on which model, whether the keys are
// there, and roughly what a call costs.
//
//   node run.mjs ai-check
//
// Three jobs, and the third is the one you cannot get anywhere else:
//
//  1. **Bindings.** `config/ai-models.json` against the declared tasks and the
//     five providers. `npm run test` fails on the same structural problems, but
//     it says "expected [] to equal [...]"; this says which task, which field
//     and what to put there.
//  2. **Keys.** Whether THIS machine can actually reach the provider each task
//     is bound to. Deliberately not part of the test suite — a developer's
//     machine legitimately has no keys, and a red build for that would train
//     people to ignore it.
//  3. **Money.** What one call would cost at the prices on file. The point is
//     that somebody choosing between two models sees the order of magnitude at
//     the moment they choose, rather than on an invoice six weeks later.
//
// Plain Node, no bundler, no TypeScript, no dependency — it has to run on
// Linux, macOS and in a Git Bash on Windows (CLAUDE.md, "Three systems").
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { PROVIDER_ENV_VARS, PROVIDER_IDS } from "../../lib/ai/providers/ids.mjs";
import { TASKS, bindingProblems, resolveBinding } from "../../lib/ai/task-rules.mjs";
import {
  estimateMicros,
  formatMicros,
  priceFor,
  priceKey,
  recommendedCurrency,
} from "../../lib/ai/pricing.mjs";
import "../lib/env.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The shape of a call the estimate is quoted for. Stated, never implied. */
const SAMPLE_INPUT_TOKENS = 1000;
const SAMPLE_OUTPUT_TOKENS = 500;

function readJson(...parts) {
  const path = join(ROOT, ...parts);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    console.error(`✗ ${parts.join("/")} could not be read: ${error.message}`);
    process.exit(1);
  }
}

const models = readJson("config", "ai-models.json");
const prices = readJson("config", "ai-prices.json");

const configured = PROVIDER_IDS.filter((id) => Boolean(process.env[PROVIDER_ENV_VARS[id]]?.trim()));

// ── 1. Providers on this machine ────────────────────────────────────────────

console.log("Providers\n");
for (const id of PROVIDER_IDS) {
  const has = configured.includes(id);
  console.log(`  ${has ? "✓" : "·"} ${id.padEnd(11)} ${has ? "key set" : PROVIDER_ENV_VARS[id] + " not set"}`);
}

if (configured.length === 0) {
  console.log(
    "\n  No provider is configured on this machine. Add ONE of the keys above to\n" +
      "  .env — you need at most one, and which one is a decision you make per\n" +
      "  task rather than per app.",
  );
}

// ── 2. Tasks and their bindings ─────────────────────────────────────────────

const defaultCurrency =
  typeof prices.defaultCurrency === "string" && prices.defaultCurrency.trim() !== ""
    ? prices.defaultCurrency.trim()
    : "USD";

console.log(`\nTasks  (estimate per call: ${SAMPLE_INPUT_TOKENS} in / ${SAMPLE_OUTPUT_TOKENS} out)\n`);

const unpriced = [];

for (const task of TASKS) {
  const binding = resolveBinding(models, task);
  const bound = Boolean(models?.tasks?.[task]);
  const price = priceFor(prices, binding.provider, binding.model);

  const estimate = price
    ? formatMicros(estimateMicros(price, SAMPLE_INPUT_TOKENS, SAMPLE_OUTPUT_TOKENS), price.currency)
    : "no price on file";

  if (!price) unpriced.push(priceKey(binding.provider, binding.model));

  console.log(`  ${task}`);
  console.log(`    provider   ${binding.provider}${bound ? "" : "  (inherited from default)"}`);
  console.log(`    model      ${binding.model}`);
  console.log(`    maxTokens  ${binding.maxTokens}`);
  console.log(`    per call   ~ ${estimate}`);
}

// ── 3. Money ────────────────────────────────────────────────────────────────

console.log("\nPrices\n");
console.log(`  currency   ${defaultCurrency}`);
console.log(`  updated    ${prices.updated ?? "— (add an \"updated\" date so you know when to re-check)"}`);
console.log(`  entries    ${Object.keys(prices.models ?? {}).length}`);

// The recommendation, and never more than that (FR-42a). A provider bills in
// what it bills in; refusing a currency would only push somebody into entering
// a hand-converted number with no rate and no date attached to it.
const locale = (process.env.DEFAULT_LOCALE ?? "de").slice(0, 2);
const recommended = recommendedCurrency(locale);
if (defaultCurrency !== recommended) {
  console.log(
    `\n  Note: for a "${locale}" installation, ${recommended} is the usual choice.\n` +
      `  This is a recommendation only — nothing converts, and a provider bills\n` +
      `  in what it bills in. Keeping ${defaultCurrency} is a perfectly good answer.`,
  );
}

if (unpriced.length > 0) {
  console.log(
    `\n  ${unpriced.length} model(s) in use have no price on file:\n` +
      unpriced.map((key) => `    ${key}`).join("\n") +
      `\n  Calls still work and are still recorded with their token counts — but\n` +
      `  the AI-costs page will count them separately instead of pretending they\n` +
      `  were free. Add them to config/ai-prices.json.`,
  );
}

// ── Verdict ─────────────────────────────────────────────────────────────────

const problems = bindingProblems(models, configured);

console.log("");
if (problems.length > 0) {
  console.error("Problems:\n");
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error("");
  process.exit(1);
}

console.log("✓ Every task is bound to a provider you have a key for.");
console.log("\n  There is no spend ceiling in this template, deliberately — a ceiling");
console.log("  protects against a runaway by taking your app's AI offline for real");
console.log("  customers. If you want a hard stop, set a usage limit on your provider");
console.log("  account, which is where the money actually crosses a boundary.");
