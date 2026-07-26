# Spec 04 — Products CRUD API

## Goal
A full, store-scoped REST API for products, replacing `shopsense/assets/mock/products.json` as the data source for `pages/products.html`, `pages/add-product.html`, `pages/edit-product.html`.

## Context
The current mock data (`assets/mock/products.json`) has fields: `id, name, sku, category, stock, unit, unitPrice, costPrice, status, reorderLevel, image, salesTrend, supplier`. `status` and `salesTrend` are *derived* values (computed from stock/reorderLevel and sales history respectively) — they should be computed by the API response, not stored directly, so they can never go stale.

## Depends on
Step 2 (Product model), Step 3 (auth middleware — every route here is protected and scoped by `req.storeId`).

## Data contracts
```
GET /api/products?search=&category=
  → 200 [{ id, name, sku, category, stock, unit, unitPrice, costPrice,
            status, reorderLevel, image, supplier }]
  status = "Out of Stock" if stock === 0
         | "Low Stock" if stock <= reorderLevel
         | "In Stock" otherwise

GET /api/products/:id
  → 200 { ...single product, same shape as above }
  → 404 { error: "Product not found" }

POST /api/products
  Body: { name, sku, category, stock, unit, unitPrice, costPrice, reorderLevel, image?, supplier? }
  → 201 { ...created product }
  → 400 validation errors
  → 409 { error: "SKU already exists" }

PUT /api/products/:id
  Body: same as POST, partial allowed
  → 200 { ...updated product }

DELETE /api/products/:id
  → 204 (no body)
```

All queries automatically filtered by `req.storeId` from the auth middleware — a store can never see or modify another store's products.

## Steps
1. Create `server/src/services/productService.ts`: `listProducts(storeId, { search, category })`, `getProduct(storeId, id)`, `createProduct(storeId, data)`, `updateProduct(storeId, id, data)`, `deleteProduct(storeId, id)`. `search` matches against `name` (case-insensitive regex or text index); `category` is an exact match filter.
2. Compute `status` in the service layer (not stored in the DB) using the rule in the data contract above.
3. Create `server/src/controllers/productsController.ts` mapping HTTP verbs to the service functions, translating not-found/duplicate-key errors to `404`/`409`.
4. Create `server/src/routes/products.routes.ts`, mount under `/api/products` behind the `auth` middleware.
5. Add zod validation for create/update bodies: `stock`, `unitPrice`, `costPrice`, `reorderLevel` must be non-negative numbers; `name`/`sku`/`category`/`unit` required strings on create.
6. After creating/updating a product, call `alertService.checkProduct(storeId, productId)` (stub this call now — implemented fully in step 6; a no-op or TODO comment is acceptable if step 6 isn't done yet, but leave the call site in place so step 6 just fills it in).

## Acceptance criteria
- `GET /api/products` returns only the authenticated user's store's products, each with a correctly computed `status`.
- `?search=Espresso` filters to matching products only (case-insensitive, partial match).
- `?category=Beverages` filters to that category only.
- Creating a product with a `sku` that already exists *for that store* → `409`; the same `sku` under a different store succeeds.
- Deleting a product removes it; a subsequent `GET /api/products/:id` on it returns `404`.
- Creating a product with negative `stock` or missing `name` → `400` with a clear validation message.

## Files created/modified
- `server/src/services/productService.ts`
- `server/src/controllers/productsController.ts`
- `server/src/routes/products.routes.ts`
- `server/src/app.ts` (mount products router)

## Out of scope
- `salesTrend` field — that comes from the clustering/analytics service (step 8), not this step. Omit it from responses here, or hardcode `null` until step 8 wires it in.
- Image upload — `image` is just a URL string for now (matches current mock data).
