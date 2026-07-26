# Spec 06 — Alert Service: Dynamic Low-Stock Detection

## Goal
Replace `assets/mock/alerts.json` with real, threshold-derived alerts computed from live product stock, exposed via a store-scoped API for `pages/alerts.html`.

## Context
Two call sites already exist and expect this service, stubbed with TODOs: `productService` (step 4, on create/update) and `salesService` (step 5, after recording a sale). This step implements the real logic they call into. The alert-generation rule is defined in `ARCHITECTURE.md §6.3`.

## Depends on
Step 2 (Alert, Product models), Step 4 (Products API), Step 5 (Sales API — both call into this service).

## Data contracts
```
GET /api/alerts
  → 200 [{ id, productId, productName, sku, category, currentStock,
            reorderLevel, recommendedReorderQty, severity, status,
            message, timestamp }]
  Ordered by severity (critical before warning), then timestamp descending.

PATCH /api/alerts/:id/read
  → 200 { ...alert, status: "read" }

POST /api/alerts/:id/reorder
  → 200 { ...updated product with stock reset, alert cleared }
  Sets product.stock to a restocked level (reorderLevel * 2, per the
  recommendedReorderQty heuristic in ARCHITECTURE.md §6.3), re-runs the
  threshold check, which clears the alert since stock is now healthy.

POST /api/alerts/reorder-all
  → 200 { reorderedCount: number }
  Runs the reorder action above for every current critical+warning alert.
```

## Steps
1. Create `server/src/services/alertService.ts`:
   - `checkProduct(storeId, productId)` — implements the rule from `ARCHITECTURE.md §6.3`:
     - `stock === 0` → upsert `Alert(severity: "critical", message: "Out of Stock! ...")`
     - `stock <= threshold * 0.3` → upsert `Alert(severity: "critical", message: "Critical low stock (<n> left)...")`
     - `stock <= threshold` → upsert `Alert(severity: "warning", message: "Stock level dropped below threshold...")`
     - else → delete any existing alert for this product (`{ storeId, productId }`)
     - `threshold = product.reorderLevel` (already store-specific per product; no separate store-level fallback needed since `reorderLevel` is required on every product per step 4)
   - `getActiveAlerts(storeId)` — returns alerts sorted by severity then recency, populated with product fields.
   - `markRead(storeId, alertId)`.
   - `reorderProduct(storeId, productId)` — sets `product.stock = reorderLevel * 2`, saves, calls `checkProduct` again (which will clear the alert).
   - `reorderAll(storeId)` — runs `reorderProduct` for every product currently alerting.
   - `getAlertCount(storeId)` — count of `status: "unread"` alerts, for badge counts (used by dashboard, step 7).
2. Wire the stubbed call sites in `productService` (step 4) and `salesService` (step 5) to call `alertService.checkProduct` for real.
3. Create `server/src/controllers/alertsController.ts` and `server/src/routes/alerts.routes.ts`: `GET /api/alerts`, `PATCH /api/alerts/:id/read`, `POST /api/alerts/:id/reorder`, `POST /api/alerts/reorder-all` — all behind `auth` middleware.
4. On server startup (in `index.ts`, after DB connects), run `checkProduct` for every product in every store once, to catch any stock changes made outside the app (e.g. direct DB edits, seed data).

## Acceptance criteria
- Setting a product's stock to 0 (via the products API) → `GET /api/alerts` shows it as `critical` with an "Out of Stock" message.
- Setting stock to a value between 30% and 100% of `reorderLevel` → `warning`; above `reorderLevel` → no alert (existing one is removed if present).
- `POST /api/alerts/:id/reorder` resets stock and the alert disappears from `GET /api/alerts` afterward.
- `POST /api/alerts/reorder-all` clears every active alert for the store in one call.
- Alerts from one store never appear in another store's `GET /api/alerts` response.

## Files created/modified
- `server/src/services/alertService.ts`
- `server/src/controllers/alertsController.ts`
- `server/src/routes/alerts.routes.ts`
- `server/src/app.ts` (mount alerts router, startup alert sweep)
- `server/src/services/productService.ts`, `server/src/services/salesService.ts` (wire real calls)

## Out of scope
- Email/push notifications for alerts (`store.notifications.lowStockAlerts` flag exists in the schema for future use, not acted on yet — see `PLAN.md §5`).
