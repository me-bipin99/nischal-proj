# Spec 07 — Dashboard API & Sales Forecast

## Goal
Replace `assets/mock/dashboard.json` with a live summary endpoint and a real weighted-moving-average forecast endpoint for `pages/dashboard.html` (formerly `index.html`'s dashboard content).

## Context
The forecast algorithm is specified in full in `ARCHITECTURE.md §6.1`. The response shape must match what `dashboard.js`/`common.js` already expect from the mock file so the chart-rendering code in step 10 needs minimal changes: `{ labels, actualSales, predictedSales }` per range, plus a top-level `summary` block.

## Depends on
Step 5 (Sales API — forecast reads from real `Sale` records), Step 6 (Alert service — summary needs `lowStockCount`/`outOfStockCount` and the stockout-risk item).

## Data contracts
```
GET /api/dashboard/summary
  → 200 {
      todaysSales: number, todaysSalesGrowth: number,       // % vs yesterday
      totalRevenue: number, totalRevenueGrowth: number,      // % vs prior month
      totalProducts: number, categoriesCount: number,
      lowStockCount: number, outOfStockCount: number,
      predictionSummary: {
        projectedDemand7Days: number, projectedRevenue7Days: number,
        topTrendingCategory: string, stockoutRiskItem: string
      }
    }

GET /api/dashboard/prediction?range=7days|14days|30days
  → 200 {
      labels: string[], actualSales: (number|null)[], predictedSales: number[],
      total: number, trendPct: number
    }
  → 200 { insufficientData: true }   when fewer than 2 periods of sales history exist
```

## Steps
1. Create `server/src/services/forecastService.ts` implementing `ARCHITECTURE.md §6.1`:
   - `getRecentPeriodTotals(storeId, nPeriods=8)` — sums `Sale.totalAmount` grouped by day (for the 7-day range) or by appropriate bucket for 14/30-day ranges, oldest first. Use MongoDB aggregation (`$group` by date truncation).
   - `predictSales(storeId, range)` — applies the weights `[0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.18, 0.22]`, computes `predictedPeriod`, builds the labeled forecast array for the requested range, computes `trendPct` against the actual same-length past period.
   - Return `{ insufficientData: true }` if fewer than 2 periods of data exist (per the edge case in `ARCHITECTURE.md §6.1`).
2. Create `server/src/services/dashboardService.ts`:
   - `getSummary(storeId)` — aggregates today's sales total + growth vs. yesterday, all-time revenue + growth vs. prior month, product/category counts (from `productService`), low/out-of-stock counts (from `alertService`), and picks the single most-critical alert's product name as `stockoutRiskItem`.
3. Create `server/src/controllers/dashboardController.ts` and `server/src/routes/dashboard.routes.ts`: `GET /api/dashboard/summary`, `GET /api/dashboard/prediction`, mounted under `/api/dashboard` behind `auth`.
4. Validate `range` query param against the allowed enum (`7days`/`14days`/`30days`), default to `7days` if omitted, `400` on an invalid value.

## Acceptance criteria
- With at least 2 weeks of seeded sales data, `GET /api/dashboard/prediction?range=7days` returns 7 labels, 7 `predictedSales` values, and `actualSales` with `null` for future/unobserved days — matching the shape in `assets/mock/dashboard.json`.
- Switching `range` from `7days` to `14days`/`30days` returns proportionally longer arrays.
- With fewer than 2 periods of sales data, the endpoint returns `{ insufficientData: true }` instead of throwing or returning garbage numbers.
- `GET /api/dashboard/summary` numbers change correctly after adding a new sale or product via their respective APIs.
- All numbers are scoped to the authenticated user's store only.

## Files created/modified
- `server/src/services/forecastService.ts`
- `server/src/services/dashboardService.ts`
- `server/src/controllers/dashboardController.ts`
- `server/src/routes/dashboard.routes.ts`
- `server/src/app.ts` (mount dashboard router)

## Out of scope
- Swapping the weighted-moving-average for a heavier model (Prophet/ARIMA equivalent) — noted as a future upgrade path only, not part of this rebuild.
