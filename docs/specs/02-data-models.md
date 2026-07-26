# Spec 02 — Data Models (Mongoose Schemas)

## Goal
Define every Mongoose schema the app needs, with correct field types, defaults, indexes, and store-scoping, matching `ARCHITECTURE.md §4`. After this step, the schemas exist and can be imported by later steps — no routes use them yet.

## Context
This is a multi-tenant app: every collection except `stores` carries a `storeId` so data never leaks across stores. Field shapes are chosen to match the existing mock data in `shopsense/assets/mock/*.json` closely, so the frontend rendering code needs minimal changes later (step 10).

## Depends on
Step 1 (backend scaffolding — `server/src/config/db.ts` must exist so models can be registered against an active connection).

## Data contracts (schema fields — see ARCHITECTURE.md §4 for full field tables)
- `Store`: name, currency, timezone, lowStockThreshold, taxRate, receiptFooter, notifications (nested object), timestamps
- `User`: storeId (ref Store), fullName, email (unique, lowercase), passwordHash, role, phone, avatar, timestamps
- `Product`: storeId (ref Store), name, sku (unique compound with storeId), category, stock, unit, unitPrice, costPrice, reorderLevel, supplier, image, isActive, timestamps
- `Sale`: storeId (ref Store), invoiceNo (unique compound with storeId), date, time, customerName, productId (ref Product), quantity, unitPrice, totalAmount, paymentMethod, status, recordedBy (ref User), createdAt
- `Alert`: storeId (ref Store), productId (ref Product), severity (enum: critical/warning), status (enum: unread/read), message, recommendedReorderQty, timestamps

## Steps
1. Create `server/src/models/Store.ts` with the `notifications` sub-schema (`emailAlerts`, `lowStockAlerts`, `dailySalesSummary`, `weeklyForecastReport`, all Boolean).
2. Create `server/src/models/User.ts`. Add a unique index on `email`. Never store plaintext passwords — only `passwordHash` (hashing happens in the auth service, step 3).
3. Create `server/src/models/Product.ts`. Add a compound unique index on `{ storeId, sku }` (SKUs are only unique *within* a store, not globally).
4. Create `server/src/models/Sale.ts`. Add a compound unique index on `{ storeId, invoiceNo }`. Reference `productId` — do NOT embed the full product; look it up when needed (small, normalized collections, no need for embedding at this scale).
5. Create `server/src/models/Alert.ts`. Add a compound index on `{ storeId, productId }` since `alertService` (step 6) will upsert by this pair.
6. Add TypeScript interfaces for each model's document shape in `server/src/types/models.ts`, and use `mongoose.Schema<IProductDocument>` typing (or equivalent) so controllers get type safety.
7. Write a quick manual smoke test: a throwaway script or `ts-node` REPL session that creates one of each document and confirms it persists and re-reads correctly, then delete the test data.

## Acceptance criteria
- All five models import without error and register with Mongoose.
- Creating a `Product` with a duplicate `{ storeId, sku }` pair throws a Mongoose duplicate-key error; creating the same `sku` under a *different* `storeId` succeeds.
- Creating a `User` with a duplicate `email` throws a duplicate-key error.
- `Sale.productId` and `User.storeId` etc. populate correctly via `.populate()`.

## Files created/modified
- `server/src/models/Store.ts`, `User.ts`, `Product.ts`, `Sale.ts`, `Alert.ts`
- `server/src/types/models.ts`

## Out of scope
- No routes/controllers yet (steps 3–9).
- No password hashing logic yet — that's the auth service in step 3; this step only defines the `passwordHash` field.
- No seed script yet — that's part of step 12, once all models and services exist.
