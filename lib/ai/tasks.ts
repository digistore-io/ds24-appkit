// The task layer, with types on.
//
// The rules live in `task-rules.mjs` next door — `scripts/ai/check.mjs` has to
// validate exactly what the app resolves, and the scripts in this repo do not
// import TypeScript (CLAUDE.md → Three systems). This file adds the union type,
// which is what stops a typo'd task name reaching a request: `runTask("chatt")`
// is a compile error, not a fallback to the default binding.
//
// ── Where it may be read ───────────────────────────────────────────────────
// Server components, Server Actions, route handlers, scripts. NOT a client
// component: it imports the model bindings, and which provider an installation
// pays has no business in a browser bundle — the same rule
// `lib/ai/chat-config.ts` and `lib/billing-mode.ts` follow.
import raw from "@/config/ai-models.json";

import {
  FALLBACK_BINDING,
  TASKS as TASK_IDS,
  bindingProblems,
  resolveBinding,
} from "./task-rules.mjs";
import { configuredProviders } from "./providers/registry";
import { PROVIDER_IDS, isProviderId, type ProviderId } from "./providers/types";

/**
 * The jobs this app performs, as a union type.
 *
 * Written out again rather than derived from the `.mjs` array, for the same
 * reason `PROVIDER_IDS` is: a plain JavaScript array cannot produce a union,
 * and the union is the whole compile-time guarantee. `tasks.test.ts` asserts
 * the two lists agree, so they cannot drift.
 */
export const TASKS = ["chat"] as const;

export type TaskId = (typeof TASKS)[number];

export function isTaskId(value: unknown): value is TaskId {
  return (TASKS as readonly unknown[]).includes(value);
}

/** Which provider and model runs a task, and under what limits. */
export interface Binding {
  provider: ProviderId;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  /** Provider-shaped, passed to the adapter verbatim. Never read here (AD-13). */
  providerOptions: Record<string, unknown>;
}

/**
 * The binding for a task.
 *
 * Never throws: a task with no entry inherits `default`, and an incomplete
 * `default` inherits the fallback. A config that is merely incomplete still
 * runs; one that is WRONG is caught by `taskProblems()` at check time, which is
 * where a mistake belongs — not at a customer's first request.
 */
export function bindingFor(task: TaskId): Binding {
  const binding = resolveBinding(raw, task) as Binding;

  // `resolveBinding` merges JSON; it does not know what a provider IS. Without
  // the check below the cast above asserts a check-time guarantee as a
  // compile-time fact, and a typo in `config/ai-models.json` becomes a
  // `TypeError` rather than the named problem `taskProblems()` promises:
  // `isConfigured()` indexes the registry unguarded, and it runs inside
  // `isChatEnabled()` in the dashboard LAYOUT — so a misspelt provider takes
  // down every page under /dashboard, not merely the chat. Falling back keeps
  // the app up; the mistake is still reported, by name, by `ai-check`.
  if (!isProviderId(binding.provider)) {
    return { ...binding, provider: FALLBACK_BINDING.provider as ProviderId };
  }
  return binding;
}

/** Every binding, for the check command and the cost page's task list. */
export function allBindings(): Record<TaskId, Binding> {
  return Object.fromEntries(TASKS.map((task) => [task, bindingFor(task)])) as Record<
    TaskId,
    Binding
  >;
}

/**
 * Everything wrong with `config/ai-models.json` — empty when it is coherent.
 *
 * The same deal `lib/billing-mode.test.ts` and `lib/ai/chat-config.test.ts`
 * make: a second source of truth is only safe while something checks it against
 * the first. `tasks.test.ts` fails the build on a non-empty result, so a binding
 * naming a provider that does not exist is caught here rather than by an
 * adapter throwing at somebody's first question.
 *
 * The unset-credential check is deliberately NOT part of the build test — a
 * developer's machine legitimately has no keys. `node run.mjs ai-check` is
 * where that one is reported.
 */
export function taskProblems(): string[] {
  return bindingProblems(raw, configuredProviders());
}

/** Problems that are about the CONFIG rather than about this machine. */
export function taskConfigProblems(): string[] {
  // Every provider treated as configured, so only structural mistakes remain.
  // Derived from PROVIDER_IDS rather than written out: a sixth provider must
  // not need remembering in two places, and this is exactly the copy somebody
  // would forget.
  return bindingProblems(raw, [...PROVIDER_IDS]);
}

export { FALLBACK_BINDING, TASK_IDS };
