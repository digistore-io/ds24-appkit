// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/** The return value of every server action in this template. */
export interface ActionState {
  error: string | null;
  ok: string | null;
}

/**
 * Shows the result of a server action as a short message (toast).
 *
 * Instead of writing success and failure by hand on every page:
 *
 *   const [state, action, pending] = useActionState(myAction, EMPTY);
 *   useActionToast(state);
 *
 * Errors come out red, successes green. The comparison runs on object
 * identity — every call of the action returns a fresh object, so the same text
 * twice in a row does show up twice.
 *
 * Not for lasting notices. A toast disappears; anything that has to stay put
 * (e.g. "Digistore24 is not connected") belongs in a `<Callout>`.
 */
export function useActionToast(state: ActionState) {
  const previous = useRef(state);

  useEffect(() => {
    if (state === previous.current) return;
    previous.current = state;
    if (state.error) toast.error(state.error);
    else if (state.ok) toast.success(state.ok);
  }, [state]);
}
