// What jobs this app performs with a model, and how a job finds its model.
//
// ── The one idea ───────────────────────────────────────────────────────────
// A call names a TASK, never a model. That single choice is what makes two
// unrelated-looking things the same thing: an Operator can rebind `chat` to a
// different provider without touching code, AND the cost report has something
// meaningful to group by. A page that says "you spent €40 on Sonnet" does not
// tell anybody which feature to change; one that says "the assistant €38, draft
// generation €2" does.
//
// ── Declared in code, bound in configuration ───────────────────────────────
// The asymmetry is the point:
//
//   a task in TASKS with no binding   → falls back to the default and works.
//                                       Adding a task is a one-line change.
//   a binding naming a task not in TASKS → a typo, and `ai-check` fails on it.
//
// Adding is cheap; misspelling is loud.
//
// ── Why .mjs ───────────────────────────────────────────────────────────────
// `scripts/ai/check.mjs` has to validate the same bindings the app resolves,
// and the scripts here do not import TypeScript (CLAUDE.md → Three systems).
// One implementation, two readers. `tasks.ts` puts the types back on.

import { PROVIDER_IDS, PROVIDER_ENV_VARS } from "./providers/ids.mjs";

/**
 * The jobs this app performs.
 *
 * **One task ships, because one task exists.** The assistant is the only thing
 * in this template that calls a model. Content generation and moderation are
 * what the layer MAKES POSSIBLE, and they live as worked examples in
 * `docs/ai-providers.md` and in the `ai-providers` skill — not here, because a
 * bound task nobody calls is a line `ai-check` complains about for ever.
 *
 * Adding your own is two steps and no migration:
 *   1. add the id here
 *   2. optionally bind it in `config/ai-models.json` (it works without)
 */
export const TASKS = ["chat"];

export function isTaskId(value) {
  return TASKS.includes(value);
}

/** Sensible when a config says nothing. Never silently applied to a typo. */
export const FALLBACK_BINDING = {
  provider: "anthropic",
  model: "claude-sonnet-5",
  maxTokens: 2000,
  timeoutMs: 60000,
  providerOptions: {},
};

/**
 * Whose vocabulary a tuning option belongs to.
 *
 * This exists because of the one edit everybody makes: moving a task to another
 * company means changing `provider` and `model`, and `providerOptions` is the
 * field people leave behind. It was written for the OLD provider, and the new
 * one answers a request carrying a field it never defined with an error — on
 * the customer's first message, with the reason in a server log nobody is
 * watching. Named here instead, by `node run.mjs ai-check`, at the moment the
 * config is changed.
 *
 * **It is not an allowlist.** `providerOptions` stays the escape hatch (AD-13):
 * a key nobody here has heard of travels untouched, because five providers add
 * parameters faster than a template can track them. Only a key that is
 * demonstrably somebody ELSE'S is refused — and it is refused as a config
 * error, never quietly dropped, because an Operator who wrote `thinking` meant
 * to buy thinking and should not be told everything is fine.
 *
 * OpenAI, Mistral and OpenRouter share one request shape (`openai-compat.ts`),
 * so what one of them understands counts as understood by all three. Being
 * generous here is deliberate: a false accusation would block a config that
 * works, which is worse than missing one that does not.
 */
const COMPAT_FAMILY = ["openai", "mistral", "openrouter"];

export const OPTION_OWNERS = {
  // Ours, not a provider's — consumed by the Anthropic adapter and never sent
  // (`RESERVED_OPTION_KEYS` in lib/ai/providers/types.ts).
  cacheTtl: ["anthropic"],
  thinking: ["anthropic"],
  output_config: ["anthropic"],
  generationConfig: ["gemini"],
  safetySettings: ["gemini"],
  cachedContent: ["gemini"],
  reasoning_effort: COMPAT_FAMILY,
  response_format: COMPAT_FAMILY,
  safe_prompt: COMPAT_FAMILY,
};

/** The keys this layer consumes itself, so they never reach a provider. */
const RESERVED_OPTIONS = ["cacheTtl"];

/** Options in this binding that were written for a different company. */
export function foreignOptions(provider, providerOptions) {
  return Object.keys(providerOptions ?? {}).filter((key) => {
    const owners = OPTION_OWNERS[key];
    return owners !== undefined && !owners.includes(provider);
  });
}

function positiveInt(value, fallback, max) {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  if (value < 1 || value > max) return fallback;
  return value;
}

/**
 * The binding for one task: which provider, which model, what limits.
 *
 * Pure — it takes the already-parsed config rather than reading a file, so the
 * app and the check command resolve identically and the resolution is testable
 * without a filesystem.
 *
 * A task with no entry inherits `default`, and `default` itself falls back to
 * FALLBACK_BINDING. So a config that is merely INCOMPLETE still runs; only a
 * config that is WRONG (unknown provider, unknown task) is refused, and it is
 * refused by `bindingProblems` at check time rather than here at call time.
 */
export function resolveBinding(config, task) {
  const base = { ...FALLBACK_BINDING, ...(config?.default ?? {}) };
  const entry = config?.tasks?.[task] ?? {};
  const merged = { ...base, ...entry };

  return {
    provider: merged.provider,
    model: merged.model,
    maxTokens: positiveInt(merged.maxTokens, FALLBACK_BINDING.maxTokens, 200000),
    timeoutMs: positiveInt(merged.timeoutMs, FALLBACK_BINDING.timeoutMs, 600000),
    // Provider-shaped tuning, merged so a task can add to the default's without
    // restating it. Never interpreted here (AD-13).
    providerOptions: {
      ...(base.providerOptions ?? {}),
      ...(entry.providerOptions ?? {}),
    },
  };
}

/**
 * Everything wrong with `config/ai-models.json`, as sentences naming the fix.
 *
 * `configuredProviders` is passed in rather than read from `process.env` here,
 * so this stays pure and so the check command can report on a machine other
 * than the one it runs on if it ever needs to.
 *
 * The whole point is WHEN this runs: at check time, naming the task and the
 * file — not at a customer's first request, where the same mistake surfaces as
 * a failed answer with the reason in a server log nobody is watching.
 */
export function bindingProblems(config, configuredProviders) {
  const problems = [];

  // A binding for a task that does not exist. Almost always a typo, and
  // otherwise a task somebody forgot to declare — either way it silently does
  // nothing, which is why it is an error rather than a warning.
  for (const task of Object.keys(config?.tasks ?? {})) {
    if (!isTaskId(task)) {
      problems.push(
        `config/ai-models.json → tasks."${task}": there is no such task. ` +
          `Declared tasks are: ${TASKS.join(", ")}. Add it to TASKS in lib/ai/task-rules.mjs, or fix the spelling.`,
      );
    }
  }

  for (const task of TASKS) {
    const binding = resolveBinding(config, task);
    const where = config?.tasks?.[task] ? `tasks."${task}"` : "default";

    if (!PROVIDER_IDS.includes(binding.provider)) {
      problems.push(
        `config/ai-models.json → ${where}.provider: "${binding.provider}" is not a provider. ` +
          `Pick one of: ${PROVIDER_IDS.join(", ")}.`,
      );
      continue;
    }

    if (typeof binding.model !== "string" || binding.model.trim() === "") {
      problems.push(`config/ai-models.json → ${where}.model: missing.`);
      continue;
    }

    if (!configuredProviders.includes(binding.provider)) {
      problems.push(
        `Task "${task}" is bound to ${binding.provider}, but ${PROVIDER_ENV_VARS[binding.provider]} ` +
          `is not set. Add it to .env — or bind the task to a provider you have a key for.`,
      );
    }

    // A leftover from the provider this task used to run on. Two different
    // wrongs, so two different sentences: one of them would be refused by the
    // provider, the other silently does nothing — and "it does nothing" is the
    // one somebody would otherwise keep for years, believing they bought it.
    for (const key of foreignOptions(binding.provider, binding.providerOptions)) {
      const owners = OPTION_OWNERS[key].join(" / ");
      problems.push(
        RESERVED_OPTIONS.includes(key)
          ? `config/ai-models.json → ${where}.providerOptions."${key}": only ${owners} has that to set, ` +
              `and this task runs on ${binding.provider} — where the line does nothing. Delete it.`
          : `config/ai-models.json → ${where}.providerOptions."${key}": that is ${owners} vocabulary, ` +
              `and this task runs on ${binding.provider}. Delete the line, or give ${binding.provider} its own ` +
              `equivalent — a request carrying a field a provider does not know comes back as an error.`,
      );
    }
  }

  return problems;
}
