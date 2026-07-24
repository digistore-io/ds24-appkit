CREATE INDEX "orders_member" ON "orders" USING btree ("member_id");
--> statement-breakpoint
-- Hand-added: the claim's hot path. On every sign-in it runs
--   WHERE member_id IS NULL AND status = 'paid'
--     AND lower(btrim(buyer_email)) = $1
-- A partial expression index that drizzle's DSL cannot generate. Without it,
-- a sign-in seq-scans every order ever placed.
CREATE INDEX "orders_unclaimed_buyer_email"
  ON "orders" (lower(btrim("buyer_email")))
  WHERE "member_id" IS NULL;
