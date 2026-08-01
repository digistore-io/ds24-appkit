// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

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
  AUTO,
  FALLBACK_BINDING,
  LAST_RESORT_PROVIDER,
  TASKS as TASK_IDS,
  bindingProblems,
  kindOfTask,
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
export const TASKS = ["chat", "image", "companion"] as const;

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
 *
 * ⚠️ **This reads the environment**, through `configuredProviders()` — because
 * the shipped binding is `"auto"`, and which company that means is a property
 * of the machine rather than of the file. Same rule as everything else in this
 * module: server components, Server Actions, route handlers and scripts, never
 * a client component.
 */
export function bindingFor(task: TaskId): Binding {
  const binding = resolveBinding(raw, task, configuredProviders()) as Binding;

  // `resolveProvider` inside `resolveBinding` already guarantees a real
  // provider id — a typo resolves like `"auto"` rather than travelling. This
  // re-asserts it at the type boundary, because the guarantee lives in a `.mjs`
  // file the compiler cannot see, and the cost of being wrong is not a wrong
  // answer: `isConfigured()` indexes the registry unguarded and runs inside
  // `isChatEnabled()` in the dashboard LAYOUT, so an unknown provider would
  // take down every page under /dashboard rather than one feature.
  if (!isProviderId(binding.provider)) {
    return { ...binding, provider: LAST_RESORT_PROVIDER as ProviderId };
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
  // The empty sink is deliberate and load-bearing. `bindingProblems()` treats a
  // caller that passes NO notes array as one with nowhere to put a note, and
  // reports the condition as a problem rather than dropping it on the floor —
  // silence being the one answer it must never give. Passing an array that is
  // then discarded says something different: this caller has a channel and
  // chooses not to render it.
  //
  // The difference is visible on `/dashboard/admin/ai-costs`, which reads this
  // list as "is the AI configured at all". Without the sink, an Anthropic-only
  // machine — a working assistant, and an `image` task nobody has asked for —
  // would report itself as unconfigured on the strength of a feature the app
  // may never use. The note belongs in `ai-check`; it is not a fault on a page
  // about spending.
  return bindingProblems(raw, configuredProviders(), { notes: [] });
}

/**
 * Things worth saying that are not wrong — the counterpart to
 * {@link taskProblems}, reading the same pass for its other output.
 *
 * A task the Operator has never bound, running on a key that cannot do its kind
 * of work, is not a misconfiguration: it is a feature nobody has asked for yet.
 * Whoever shows these must not fail on them.
 *
 * `scripts/ai/check.mjs` does not call this — it cannot import TypeScript
 * (CLAUDE.md → *Three systems*) and collects the same array from
 * `bindingProblems()` directly. This is the accessor for everything that can.
 */
export function taskNotes(): string[] {
  const notes: string[] = [];
  bindingProblems(raw, configuredProviders(), { notes });
  return notes;
}

/** Problems that are about the CONFIG rather than about this machine. */
export function taskConfigProblems(): string[] {
  // Every provider treated as configured, so only structural mistakes remain.
  // Derived from PROVIDER_IDS rather than written out: a sixth provider must
  // not need remembering in two places, and this is exactly the copy somebody
  // would forget.
  return bindingProblems(raw, [...PROVIDER_IDS]);
}

/** What a task needs a provider to be able to do — `"text"` or `"image"`. */
export const taskKind: (task: TaskId) => "text" | "image" = kindOfTask;

export { AUTO, FALLBACK_BINDING, LAST_RESORT_PROVIDER, TASK_IDS };
