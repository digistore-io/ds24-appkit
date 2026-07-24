-- HAND-CORRECTED. drizzle emitted this predicate with QUALIFIED column names
-- ("token_ledger"."ds24_order_id"), which Postgres rejects inside a
-- CREATE INDEX ... WHERE. Worse, `db:migrate` prints that error and then
-- reports "migrations applied successfully", so the index silently does not
-- exist — and every credit then 500s on an ON CONFLICT with no matching index,
-- which is exactly how this was shipped broken once already.
--
-- One Digistore24 order is one payment and may be booked ONCE, on any account.
-- The composite unique (account_id, ds24_order_id) cannot express that: both
-- token_accounts.member_id and orders.member_id are `set null` on delete, so a
-- deleted-and-recreated Member gets a second account and the same order is
-- credited again.
CREATE UNIQUE INDEX "token_ledger_topup_order_global"
  ON "token_ledger" ("ds24_order_id")
  WHERE "ds24_order_id" IS NOT NULL AND "type" = 'topup';
