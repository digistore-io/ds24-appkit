// The job ids, and nothing else.
//
// ── Why this is a file of its own ─────────────────────────────────────────
// `lib/cron/jobs.ts` holds the job BODIES, so it imports `@/db`, the entitlement
// layer, the mail transport — whatever the jobs need. Anything that imports it
// inherits all of that.
//
// Two callers need only the NAMES:
//
//  • `lib/cron/config.ts`, to say which configured job does not exist. It is
//    read by `instrumentation.ts` to decide whether to start a timer at all,
//    and that hook is built for the edge runtime too — dragging the database
//    into it is the same trap `instrumentation.ts` already documents about
//    `lib/email`.
//  • `scripts/cron/run.mjs`, plain Node, which does not import TypeScript.
//
// So the names live here and `lib/cron/jobs.test.ts` asserts the registry
// matches — the same deal `lib/ai/providers/ids.mjs` makes for the providers
// and `task-rules.mjs` for the AI tasks. Adding a job means adding it in two
// places, and forgetting the second is a failing test rather than a job that
// silently cannot be configured.
export const JOB_IDS = ["prune-ai-usage", "prune-ipn-log"];
