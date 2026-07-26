# Spec 08 — Analytics API & Product Clustering

## Goal
Replace `assets/mock/analytics.json` with a live K-Means clustering endpoint for `pages/analytics.html`, grouping products into Fast-Moving/Seasonal/Slow-Moving based on real sales history.

## Context
The clustering algorithm is fully specified in `ARCHITECTURE.md §6.2`. This is a small, self-contained numerical problem (2 features, k=3) — implement K-Means directly in TypeScript rather than pulling in an ML dependency.

## Depends on
Step 5 (Sales API — clustering needs per-product sales history).

## Data contracts
```
GET /api/analytics/clusters?timeframe=month|3months|year
  → 200 {
      clusters: {
        fastMoving: { count, avgTurnoverDays, totalRevenueShare },
        seasonal:   { count, avgTurnoverDays, totalRevenueShare },
        slowMoving: { count, avgTurnoverDays, totalRevenueShare }
      },
      scatterData: {
        fastMoving: [{ x, y, productName, sku, stock, revenue }],
        seasonal:   [{ x, y, productName, sku, stock, revenue }],
        slowMoving: [{ x, y, productName, sku, stock, revenue }]
      }
    }
  → 200 { unclustered: true, products: [...] }   when fewer than 3 active products exist

  x = velocity (0-100 normalized), y = consistency (0-100 normalized)
```

## Steps
1. Create `server/src/services/clusteringService.ts` implementing `ARCHITECTURE.md §6.2`:
   - `computeProductFeatures(storeId, timeframe)` — for each active product, aggregate `Sale.quantity` over the timeframe bucketed by period (day/week depending on timeframe length), compute `velocity = mean(quantities)` and `consistency = 1 - (stddev/mean)` (0 if mean is 0).
   - `normalize(values)` — min-max scale an array to [0, 100].
   - `kMeans(points, k=3, seed)` — a small, self-contained K-Means implementation: k-means++ initialization, iterate assign/update until centroids stabilize or a max iteration cap is hit. No external dependency required — this is ~60 lines of TypeScript for 2D points.
   - `labelClusters(centroids)` — the centroid with highest velocity → `"Fast-Moving"`; lowest consistency → `"Seasonal"`; remaining → `"Slow-Moving"` (exact rule from `ARCHITECTURE.md §6.2`).
   - `clusterProducts(storeId, timeframe)` — orchestrates the above, returns the full response shape. If `n_products < 3`, returns `{ unclustered: true, products }` instead of running K-Means.
   - `getClusterSummary(storeId, timeframe)` — count, avg turnover days (`365 / (velocity per year)`, approximate), and revenue share per cluster for the `clusters` block.
2. Create `server/src/controllers/analyticsController.ts` and `server/src/routes/analytics.routes.ts`: `GET /api/analytics/clusters`, mounted under `/api/analytics` behind `auth`.
3. Validate `timeframe` against the allowed enum (`month`/`3months`/`year`), default `month`, `400` on invalid value.
4. (Optional, ties back into step 4) Once this endpoint exists, `productService.listProducts` can enrich each product's `salesTrend` field by looking up which cluster it fell into on the most recent computation — acceptable to leave `salesTrend` as `null` if this cross-wiring adds too much coupling; note the decision either way in this file's own follow-up if you change it.

## Acceptance criteria
- With at least 3 active products and some sales history, `GET /api/analytics/clusters?timeframe=month` returns three non-overlapping groups covering all active products.
- A product with high, steady sales volume lands in `fastMoving`; a product with highly variable sales lands in `seasonal`; a product with low sales lands in `slowMoving` (verify with a small hand-crafted seed dataset where the expected outcome is obvious).
- With fewer than 3 active products, the endpoint returns `{ unclustered: true, products }` instead of erroring.
- Changing `timeframe` recomputes clusters using only sales within that window.
- Cluster assignments never mix products from different stores.

## Files created/modified
- `server/src/services/clusteringService.ts`
- `server/src/controllers/analyticsController.ts`
- `server/src/routes/analytics.routes.ts`
- `server/src/app.ts` (mount analytics router)

## Out of scope
- Persisting cluster assignments to the database — clusters are computed fresh on each request (cheap at this data scale; revisit only if performance becomes an issue).
