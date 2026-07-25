// A timeout that measures SILENCE, not total duration.
//
// ── Why this is not `AbortSignal.timeout` ──────────────────────────────────
// `AbortSignal.timeout(60_000)` covers the whole request including the response
// body. On a streamed answer that is the wrong measurement: a long reply that
// legitimately takes ninety seconds gets cut off mid-sentence, with the Member
// watching it happen, and the adapter reports it as `providerUnreachable` — a
// diagnosis that sends whoever reads the log looking at the network.
//
// What a budget is actually for on a stream is a provider that has gone quiet.
// So the clock resets on every chunk that arrives, and the request is abandoned
// only when nothing has arrived for the whole window.
//
// The non-streaming path keeps the total timeout, which is right there: a
// request that has not answered at all in a minute is not going to.
export class IdleTimeout {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private done = false;

  constructor(private readonly ms: number) {
    this.arm();
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Something arrived. Start the window again. */
  touch(): void {
    if (this.done) return;
    this.arm();
  }

  /** The stream is over — stop holding a timer open on a finished request. */
  clear(): void {
    this.done = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      // `abort()` rather than a thrown error: the fetch is what has to be told,
      // and it turns this into the same rejection a network failure produces,
      // so the adapter's existing `providerUnreachable` mapping covers it.
      this.controller.abort(new Error(`no data from the provider for ${this.ms}ms`));
    }, this.ms);
    // Node keeps the process alive for a pending timer. A script that finishes
    // while one is armed would otherwise hang for the length of the window.
    this.timer.unref?.();
  }
}
