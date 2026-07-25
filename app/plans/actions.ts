"use server";

// Click-time checkout for a signed-in Member.
//
// The page no longer builds a link for every plan while rendering. A Member
// presses a button, and only then does this run: record who is buying what,
// then ask Digistore24 for a checkout URL that carries that record's id.
//
// The buyer's identity travels WITH the checkout: their member id, their
// checkout token and the product key, in tracking[custom]. Digistore24 stores
// it on the purchase and hands it back on every later event, which is what
// lets a payment find its owner even when the buyer pays under an address the
// app has never seen.
//
// SECURITY: a server action is an HTTP endpoint of its own. The button only
// renders for a signed-in Member, but that is cosmetics — the check below is
// what actually holds.
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getProduct } from "@/lib/digistore/products";
import { checkoutLinkFor } from "@/lib/digistore/checkout";
import { buildIdentity } from "@/lib/digistore/custom";
import { ensureCheckoutToken } from "@/lib/users/checkout-token";

export async function startCheckoutAction(formData: FormData): Promise<void> {
  const session = await auth();
  const memberId = session?.user?.id;
  const email = session?.user?.email ?? undefined;

  if (!memberId) redirect("/login");

  const productKey = String(formData.get("planKey") ?? "");
  // The checkbox on a token card. Only meaningful for a package — a
  // subscription has no balance to keep topped up — so the product decides
  // below, not the form.
  const wantsAutoReload = formData.get("autoReload") === "on";
  let url: string | null = null;

  try {
    // Throws on an unknown key — a tampered form must not silently do nothing.
    const def = getProduct(productKey);
    const checkoutToken = await ensureCheckoutToken(memberId);

    const link = await checkoutLinkFor(def, {
      // Pins the checkout to the address they signed in with. They may still
      // pay with another one at Digistore24 — the identity string is what
      // makes that harmless.
      ...(email ? { buyer: { email } } : {}),
      customTracking: buildIdentity({
        memberId,
        checkoutToken,
        productKey,
        // Subscriptions and one-off token packages are told apart in the
        // ledger by this. Auto top-ups carry "auto" (set in autoReloadIfNeeded).
        kind: def.kind === "subscription" ? "sub" : "topup",
        // Travels as one more pair in tracking[custom] (AD-5) rather than a
        // column, because the thing it will be attached to does not exist yet:
        // the chargeable purchase_id is created when Digistore24 confirms this
        // payment. The IPN reads the pair back and arms the mandate then.
        armAutoReload: wantsAutoReload && def.kind === "token",
      }),
    });
    url = link.url;
  } catch (error) {
    // Visible in `node run.mjs logs`. The buyer gets a sentence, not a stack trace,
    // and never a fabricated checkout URL — a failed checkout must never look
    // like a successful one (see the `guardrails` skill).
    console.error("[checkout] could not start checkout:", error);
  }

  // MUST stay outside the try/catch above. redirect() works by throwing a
  // NEXT_REDIRECT control-flow error; caught, it would be logged as an
  // unexpected failure and the buyer would be stranded on /plans with a
  // generic message while everything had in fact worked.
  if (!url) redirect("/plans?checkout=error");
  redirect(url);
}
