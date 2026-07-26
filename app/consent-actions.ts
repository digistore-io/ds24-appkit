// Copyright (c) 2026 Digistore24 Inc, St. Petersburg, USA
// SPDX-License-Identifier: MIT

"use server";

// Answering a consent question.
//
// Root-level rather than inside a page folder, like `app/impersonation-actions.ts`:
// the dialog can be rendered from anywhere — the account page, a layout, a
// feature that needs permission before it acts — and an action living under one
// page would make every other caller import across a route boundary.
//
// SECURITY. Two properties, both load-bearing:
//
//  1. `recordConsent()` takes no member id, so neither does this. The account
//     answered for is always the session's own. A Server Action is an HTTP
//     endpoint of its own; a member id in the form is a parameter an attacker
//     controls, and a consent written against somebody else's account is a
//     fabricated permission carrying the operator's name.
//  2. The `textVersion` is NOT taken from the form either. It is read from
//     `config/consent.json` at the moment of writing — a browser tab left open
//     across a wording change would otherwise record agreement to a sentence
//     that no longer exists.
//
// LANGUAGE: the codes from `lib/consent/rules.ts` become sentences here, in the
// language of the person clicking — the AD-10 rule.
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";

import { recordConsent } from "@/lib/consent/manage";
import { ConsentError } from "@/lib/consent/rules";

export interface ConsentActionState {
  error: string | null;
  ok: string | null;
}

/**
 * Record one answer — yes or no.
 *
 * **A refusal is written, not swallowed.** It is the evidence that "no" was
 * honoured, and it is what stops the dialog asking the same person again
 * tomorrow (`needsAsking` in `lib/consent/rules.ts`). An app that only stores
 * the yeses cannot tell a refusal from a question never asked.
 */
export async function answerConsentAction(
  _state: ConsentActionState,
  formData: FormData,
): Promise<ConsentActionState> {
  const t = await getTranslations("consent");
  const tErrors = await getTranslations("errors");

  const purpose = String(formData.get("purpose") ?? "");
  // Exactly "true" counts as agreement. Anything else — a missing field, a
  // truncated submission, a value somebody typed — is a no, because the failure
  // that matters here is the one that grants permission by accident.
  const granted = formData.get("granted") === "true";

  try {
    await recordConsent({ purpose, granted, locale: await getLocale() });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ConsentError) return { error: tErrors(error.code), ok: null };
    throw error;
  }

  // The account page renders the current state; without this it keeps showing
  // the answer from before the click.
  revalidatePath("/dashboard/account");

  return { error: null, ok: granted ? t("recordedGranted") : t("recordedRefused") };
}
