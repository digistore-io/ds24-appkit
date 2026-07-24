---
name: compliance-check
description: Checks the legal basics (above all DE/EU) before selling and creates the missing legal pages — Impressum (legal notice), Datenschutzerklärung (privacy policy) and, depending on the seller role, AGB (terms and conditions) and Widerrufsbelehrung (right-of-withdrawal notice). Checks the GDPR basics (data minimization, consent, data processing agreements) and links the pages in the footer. Use this before go-live/go-to-market. NOT legal advice — templates with placeholders.
---

# Compliance check — legally ready to start (DE/EU)

Goal: give the app its **legal basics** before selling. This does **not replace
legal advice** — it creates templates with placeholders and points out
obligations. For binding texts, use a lawyer or an official generator (e.g. from
the IHK/eRecht24/law firms).

## Important: who is the seller?

In many setups Digistore24 acts as the **reseller** (the buyer's contractual
partner) and then takes over parts of the seller's legal obligations (invoice,
right of withdrawal in the checkout, VAT). **Even so**, your own app/landing page
needs its own legal texts (at least Impressum + privacy). Clarify the role in the
Digistore contract and align the AGB/right of withdrawal accordingly.

## Checklist — creating the pages (if missing)

Create the missing pages as their own routes and link them in the footer (of every page):
- **Impressum** (`/impressum`) — legal notice / provider identification (§5 TMG/§18 MStV):
  name/company, address, contact, VAT ID if applicable, authorized representatives.
- **Datenschutzerklärung** (`/datenschutz`) — privacy policy, GDPR: which data, purpose,
  legal basis, recipients (host, Digistore, e-mail service), retention period,
  data subject rights, contact.
- **AGB** (`/agb`) — terms and conditions, only if you (not Digistore) are the
  seller, or for the use of the app's service.
- **Widerrufsbelehrung** (`/widerruf`) — right-of-withdrawal notice, for
  consumers; for digital content the right of withdrawal only expires with
  explicit agreement + acknowledgement (otherwise the right of withdrawal
  applies). Only needed if you are the seller.

Put clearly recognizable placeholders into the templates, e.g. `[FIRMENNAME]`,
`[ANSCHRIFT]`, `[E-MAIL]`, and instruct the user to replace them.

## GDPR basics (check)

- **Data minimization:** only collect what is needed.
- **Consent:** the opt-in page records the consent (`orders.gdprConsentAt`);
  mind `is_gdpr_country`.
- **Data processing agreement (AVV):** conclude one with the host, Digistore and the
  e-mail service (the providers supply model contracts).
- **Cookies/tracking:** only with consent (consent banner) — but **only** if
  there really is tracking. No tracking, no banner needed.
- **Data access/deletion:** provide a way to export/delete customer data on request.

## Procedure

1. **Check:** which legal pages exist? Which role does Digistore have (reseller)?
2. **Create:** create the missing pages as templates with placeholders, link them
   in the footer.
3. **Tick off GDPR:** go through the points above, name the open to-dos.
4. **Point out:** say clearly what the user has to fill in/check (or have checked) themselves.

## STOP / limit
This is **not legal advice**. When in doubt (above all AGB/right of withdrawal, taxes,
special categories of data) involve a lawyer/tax advisor — see `guardrails`.

Next step: **`go-live`** (putting it online), then **`go-to-market`**.
