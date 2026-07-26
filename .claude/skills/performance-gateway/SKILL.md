---
name: performance-gateway
description: Performance gateway before the launch. Makes sure the first version runs reliably and fast for up to ~100 parallel users. Checks and fixes the typical bottlenecks (database pooling, missing indexes, N+1 queries, unnecessary render work), runs a simple load test and sets up the right hosting/DB size. Use this after the security gateway and before the launch.
---

# Performance gateway — up to 100 parallel users

Goal for the first version: **~100 concurrent users** run smoothly (low latency,
no errors). The approach: **measure → find bottlenecks → fix → measure again.**
Do not guess — prove it with a small load test.

## The typical bottlenecks (check and fix)

### 1. Database connections (the most common cause)
- The DB client (`db/index.ts`) uses a **pool** with `DB_POOL_MAX` (default 10).
  With a single, permanently running server (Railway/Render/Fly/DigitalOcean) the pool should
  have several connections (10–20) — **not 1**, otherwise all requests get
  serialized.
- **Serverless/multiple instances:** connections add up (instances × pool).
  Then put a **connection pooler** in front (e.g. PgBouncer / Neon/Supabase
  pooling) and keep `DB_POOL_MAX` small. Mind the Postgres `max_connections`.
- Check that **one** client instance exists per process (no new client per
  request).

### 2. Indexes for frequent queries
- Postgres does **not** index foreign keys automatically. Create indexes for
  columns used in frequent `WHERE` filters, e.g. `orders.member_id`,
  `orders.ds24_product_id`, and domain FKs (e.g. `challenges.user_id`). Unique
  columns (`ds24_order_id`, `offer_key`) are already indexed.
- After a schema change: `npm run db:generate && npm run db:migrate`.

### 3. Queries & rendering
- **Avoid N+1:** load lists with a single query (Drizzle `with`/joins), not one
  per element.
- Only select the columns/rows you need; paginate large lists.
- Cache static/public pages where possible; do not do expensive work on every render.
- Checkout URLs are already cached (`buy_url_cache`) — do not regenerate them per request.

### 4. Hosting size
- Choose a small, but not the smallest instance; set autoscaling/min instances so
  that cold starts do not slow the launch down.
- Managed Postgres with enough connections/RAM for the start.

## Load test (proof of ~100 parallel)

Run a simple load test against the most important paths (home page,
access/content page, possibly the IPN endpoint) and check latency and error rate
at ~100 concurrent connections. Example with `autocannon` (no installation):

```bash
npx autocannon -c 100 -d 20 http://localhost:3000/            # 100 connections, 20s
npx autocannon -c 100 -d 20 http://localhost:3000/api/healthz
```

Target values for the first version: **0 errors/timeouts**, p95 latency in the
three-digit ms range for dynamic pages. If it breaks out → check the points above
(above all DB pool/indexes) and measure again.

## Procedure

1. **Measure:** load test against 2–3 central endpoints at `-c 100`.
2. **Fix:** biggest bottleneck first (usually the DB pool or a missing index).
3. **Measure again:** until the target values are reached.
4. **Report:** short summary (before/after, what was changed).

Next step after a green performance gateway: **`compliance-check`** (legal),
then **`go-live`** (putting it online), then **`go-to-market`** (marketing).
