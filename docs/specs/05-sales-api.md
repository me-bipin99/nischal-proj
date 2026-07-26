# Spec 05 — Sales Recording API

## Goal
A store-scoped API to record sales (invoices) and list sales history, replacing `assets/mock/sales.json` as the data source for `pages/sales.html`. Recording a sale must decrement the corresponding product's stock.

## Context
The mock data shape (`assets/mock/sales.json`) is per-transaction/invoice, not weekly-aggregated: `id, invoiceNo, date, time, week, customerName, productId, productName, quantity, unitPrice, totalAmount, paymentMethod, status`. `week` (e.g. `"Week 30"`) is derived from `date` at read time — don't store it.

## Depends on
Step 2 (Sale, Product models), Step 3 (auth), Step 4 (Product service — sale creation needs to read/update product stock and price).

## Data contracts
```
GET /api/sales?page=1&pageSize=10
  → 200 {
      sales: [{ id, invoiceNo, date, time, week, customerName,
                 productId, productName, quantity, unitPrice, totalAmount,
                 paymentMethod, status }],
      page, pageSize, totalCount, totalPages
    }

POST /api/sales
  Body: { productId, quantity, customerName, paymentMethod }
  → 201 { ...created sale, same shape as list item }
  → 400 { error: "Insufficient stock" }   (quantity > current product.stock)
  → 404 { error: "Product not found" }
```

`invoiceNo` is server-generated: `INV-<year>-<zero-padded-sequence>` per store (sequence can be a simple count of existing sales for that store + 1, or a dedicated counter — either is fine at this scale).
`unitPrice` and `totalAmount` are snapshotted from the product's current `unitPrice` at the time of sale (so historical invoices don't change if the product's price changes later).

## Steps
1. Create `server/src/services/salesService.ts`:
   - `recordSale(storeId, userId, { productId, quantity, customerName, paymentMethod })`:
     a. Load the product (scoped to `storeId`), verify it exists and `stock >= quantity`.
     b. Create the `Sale` document: snapshot `unitPrice` from the product, compute `totalAmount = quantity * unitPrice`, generate `invoiceNo`, set `status: "Completed"`, `recordedBy: userId`.
     c. Decrement `product.stock -= quantity` and save.
     d. Call `alertService.checkProduct(storeId, productId)` (fills in fully once step 6 exists).
   - `listSales(storeId, page, pageSize)` → paginated, sorted by `createdAt` descending, joined with product name via `.populate()`.
2. Compute the `week` field (e.g. `"Week 30"`) from `date` at response time using ISO week numbering — do not persist it.
3. Create `server/src/controllers/salesController.ts` and `server/src/routes/sales.routes.ts`, mount under `/api/sales` behind `auth` middleware.
4. Add zod validation: `quantity` must be a positive integer; `productId` required and must be a valid ObjectId.
5. Wrap steps 1a–1c in a Mongoose session/transaction if the deployment target supports replica-set transactions (Atlas does by default) — a sale and its stock decrement should be atomic. If transactions add friction in dev, at minimum ensure the stock check happens immediately before the decrement to avoid negative stock from ordinary concurrent use.

## Acceptance criteria
- Recording a sale for a product with sufficient stock succeeds, returns a fully-populated sale object, and the product's `stock` is reduced by `quantity` in the database.
- Recording a sale with `quantity` greater than current stock → `400`, no `Sale` document created, stock unchanged.
- `GET /api/sales?page=1&pageSize=10` returns exactly 10 items (or fewer on the last page) with correct `totalCount`/`totalPages`.
- Two sales recorded for the same store get sequential, unique `invoiceNo` values.
- `week` in the response matches the ISO week number of `date`.

## Files created/modified
- `server/src/services/salesService.ts`
- `server/src/controllers/salesController.ts`
- `server/src/routes/sales.routes.ts`
- `server/src/app.ts` (mount sales router)

## Out of scope
- Refunds/status changes beyond `"Completed"` — not modeled yet, add later if needed.
- Real payment processing — `paymentMethod` is just a recorded label (per `PLAN.md §5`).
