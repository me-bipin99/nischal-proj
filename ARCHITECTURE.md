# ShopSense — System Architecture & Overall Context

> **Project:** ShopSense — Retail Inventory & Sales Intelligence Platform
> **Stage:** Static HTML/JS prototype (mock JSON) → Full-stack Node.js + MongoDB application
> **Last Updated:** 2026-07-25

---

## 1. Project Context

### What Is ShopSense?
ShopSense is a web-based inventory management and sales intelligence platform for retail shops. It:

- Tracks product stock levels and fires low-stock/out-of-stock alerts
- Records per-transaction sales (invoices)
- Predicts near-term sales demand using a weighted moving average forecast
- Clusters products into Fast-Moving, Seasonal, and Slow-Moving groups based on sales velocity and consistency

### Current State
`shopsense/` is a static prototype: Bootstrap 5 + vanilla JS pages (`pages/*.html`) that read hard-coded mock data from `assets/mock/*.json` through a shared `ShopSense.fetchData(key, mockPath)` helper in `assets/js/common.js`, caching results in `localStorage`. Login (`auth.js`) is entirely fake — it writes a flag to `localStorage` with no server round-trip. There is no backend, no real database, and no real algorithms.

*(Note: an earlier `ARCHITECTURE.md`/`TASKS.md` described a Flask + Jinja2 + SQLAlchemy + SQL plan for a different, kirana-store-shaped data model. That plan was never implemented and doesn't match this prototype's actual data shapes — USD invoices, customers, suppliers, cost price — so it has been replaced by this document.)*

### Target State
A multi-store, multi-user web application where every page's data comes from a real MongoDB database via a Node.js/Express API, and the forecasting/clustering algorithms run server-side in TypeScript. The existing frontend HTML/CSS/JS is preserved as-is; only its data source changes from mock JSON files to authenticated REST calls.

### Tech Stack Decision
| Layer | Technology | Reason |
|---|---|---|
| Backend | Node.js + Express 4 | Matches the vanilla-JS frontend; one language across the stack |
| Language | TypeScript | Type-safe models/routes; compiled with `tsc`, run with `ts-node-dev` in dev |
| ODM | Mongoose | Standard MongoDB ODM for Node — schema validation, hooks, population |
| DB | MongoDB Atlas | Cloud-hosted for both dev and prod — no local Mongo install required |
| Auth | JWT (jsonwebtoken) + bcrypt | Stateless tokens, standard for a REST API consumed by a JS frontend |
| Validation | zod | Schema validation for request bodies, shared types with TS |
| Algorithms | Hand-rolled TypeScript | Weighted moving average + small K-Means (k=3, 2 features) — no ML framework needed at this scale |
| Testing | Jest + Supertest + mongodb-memory-server | Isolated, fast API/service tests with no shared DB state |
| Deployment | Node process behind Nginx (or a PaaS like Render/Railway) | Standard Node deployment; details finalized in the hardening step |

---

## 2. Folder Structure

```
project/
│
├── shopsense/                     # Existing frontend — UNCHANGED structurally
│   ├── pages/*.html
│   ├── assets/css/style.css
│   ├── assets/js/*.js             # common.js, auth.js, dashboard.js, etc. — data source swapped to /api/*
│   └── assets/mock/*.json         # kept only as fixtures for seeding/tests, no longer read by the app
│
├── server/                        # NEW — Express + TypeScript API
│   ├── src/
│   │   ├── index.ts               # Entry point — starts HTTP server
│   │   ├── app.ts                 # Express app factory — middleware, routes, error handlers
│   │   ├── config/
│   │   │   ├── env.ts             # Loads/validates environment variables
│   │   │   └── db.ts              # Mongoose connection setup
│   │   ├── models/                # Mongoose schemas
│   │   │   ├── Store.ts
│   │   │   ├── User.ts
│   │   │   ├── Product.ts
│   │   │   ├── Sale.ts
│   │   │   └── Alert.ts
│   │   ├── routes/                # Express routers (one per feature)
│   │   │   ├── auth.routes.ts
│   │   │   ├── products.routes.ts
│   │   │   ├── sales.routes.ts
│   │   │   ├── alerts.routes.ts
│   │   │   ├── analytics.routes.ts
│   │   │   ├── dashboard.routes.ts
│   │   │   └── settings.routes.ts
│   │   ├── controllers/           # Request/response glue — calls services
│   │   ├── services/              # Business logic — no Express imports
│   │   │   ├── authService.ts
│   │   │   ├── productService.ts
│   │   │   ├── salesService.ts
│   │   │   ├── alertService.ts
│   │   │   ├── forecastService.ts     # Weighted moving average
│   │   │   └── clusteringService.ts   # K-Means (k=3)
│   │   ├── middleware/
│   │   │   ├── auth.ts            # JWT verification, attaches req.user + req.storeId
│   │   │   ├── errorHandler.ts
│   │   │   └── validate.ts        # zod request validation wrapper
│   │   └── types/                 # Shared TS types/interfaces
│   ├── tests/                     # Jest + Supertest, one file per route/service
│   ├── seed.ts                    # Dev DB seeder — loads assets/mock/*.json shapes into MongoDB
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── docs/
│   └── specs/                     # One self-contained spec per implementation step (see PLAN.md)
│
├── PLAN.md                        # Roadmap + spec-driven development process
├── TASKS.md                       # Task index — links to docs/specs/*
└── ARCHITECTURE.md                # This document
```

---

## 3. System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                       BROWSER (Client)                        │
│                                                                │
│   Bootstrap 5 · Chart.js 4 · Vanilla JS fetch()               │
│   Existing static HTML pages — unchanged markup                │
└────────────────────────┬───────────────────────────────────────┘
                         │ HTTP requests
                         │ Authorization: Bearer <jwt>
                         │ GET/POST/PUT/DELETE /api/*
                         │
┌────────────────────────▼───────────────────────────────────────┐
│                 EXPRESS APPLICATION LAYER (TypeScript)          │
│                                                                │
│   auth.routes       →  /api/auth/signup  /login               │
│   dashboard.routes  →  /api/dashboard/summary  /prediction     │
│   products.routes   →  /api/products  /:id                    │
│   sales.routes      →  /api/sales                              │
│   alerts.routes     →  /api/alerts  /:id/read  /:id/reorder    │
│   analytics.routes  →  /api/analytics/clusters                 │
│   settings.routes   →  /api/settings  /api/account             │
└────────────────────────┬───────────────────────────────────────┘
                         │ calls
                         │
┌────────────────────────▼───────────────────────────────────────┐
│                    SERVICE / LOGIC LAYER                        │
│                                                                │
│   authService        →  hash/verify passwords, issue JWTs      │
│   productService      →  CRUD, search/filter                   │
│   salesService        →  record sale, decrement stock           │
│   alertService        →  threshold checks, alert CRUD           │
│   forecastService     →  weighted moving average                │
│   clusteringService   →  K-Means (velocity/consistency)         │
└────────────────────────┬───────────────────────────────────────┘
                         │ queries/writes via Mongoose
                         │
┌────────────────────────▼───────────────────────────────────────┐
│                        DATA LAYER                                │
│                                                                │
│   MongoDB Atlas                                                │
│   stores · users · products · sales · alerts                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Database Schema (MongoDB / Mongoose)

Every collection except `stores` carries a `storeId` field for multi-tenant scoping. All queries are filtered by the authenticated user's `storeId` via the `auth` middleware.

### stores
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | String | Store display name |
| `currency` | String | Default `"USD ($)"` |
| `timezone` | String | Default `"America/New_York (UTC-05:00)"` |
| `lowStockThreshold` | Number | Default 15 (percent or absolute unit — see spec 09) |
| `taxRate` | Number | Default 8.5 |
| `receiptFooter` | String | |
| `notifications` | Object | `{ emailAlerts, lowStockAlerts, dailySalesSummary, weeklyForecastReport }` |
| `createdAt` / `updatedAt` | Date | Mongoose timestamps |

### users
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `storeId` | ObjectId ref `Store` | |
| `fullName` | String | |
| `email` | String, unique | Login credential |
| `passwordHash` | String | bcrypt hash |
| `role` | String | e.g. `"Store Manager"`, `"Admin"`, `"Staff"` |
| `phone` | String | |
| `avatar` | String | URL or uploaded path |
| `createdAt` / `updatedAt` | Date | |

### products
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `storeId` | ObjectId ref `Store` | |
| `name` | String | |
| `sku` | String, unique per store | |
| `category` | String | |
| `stock` | Number | Updated on each sale |
| `unit` | String | e.g. "pcs", "bottle", "pack" |
| `unitPrice` | Number | Sale price |
| `costPrice` | Number | |
| `reorderLevel` | Number | Threshold for this specific product |
| `supplier` | String | |
| `image` | String | URL |
| `isActive` | Boolean | Default true |
| `createdAt` / `updatedAt` | Date | |

### sales
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `storeId` | ObjectId ref `Store` | |
| `invoiceNo` | String, unique per store | Auto-generated e.g. `INV-2026-0891` |
| `date` / `time` | Date | |
| `customerName` | String | |
| `productId` | ObjectId ref `Product` | |
| `quantity` | Number | |
| `unitPrice` | Number | Snapshot at time of sale |
| `totalAmount` | Number | `quantity * unitPrice` |
| `paymentMethod` | String | e.g. "Credit Card", "Cash", "Apple Pay" |
| `status` | String | `"Completed"`, `"Refunded"`, etc. |
| `recordedBy` | ObjectId ref `User` | |
| `createdAt` | Date | |

### alerts
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `storeId` | ObjectId ref `Store` | |
| `productId` | ObjectId ref `Product` | |
| `severity` | String | `"critical"` or `"warning"` |
| `status` | String | `"unread"` or `"read"` |
| `message` | String | Human-readable |
| `recommendedReorderQty` | Number | |
| `createdAt` / `updatedAt` | Date | |

---

## 5. API Endpoints Reference

### Authentication
```
POST /api/auth/signup     Body: { fullName, email, password, storeName }
POST /api/auth/login      Body: { email, password }  → { token, user }
```

### Dashboard
```
GET /api/dashboard/summary
    → { todaysSales, todaysSalesGrowth, totalRevenue, totalRevenueGrowth,
        totalProducts, categoriesCount, lowStockCount, outOfStockCount,
        predictionSummary }

GET /api/dashboard/prediction?range=7days|14days|30days
    → { labels, actualSales, predictedSales, total, trendPct }
```

### Products
```
GET    /api/products?search=&category=
GET    /api/products/:id
POST   /api/products
PUT    /api/products/:id
DELETE /api/products/:id
```

### Sales
```
GET  /api/sales?page=1
POST /api/sales     Body: { productId, quantity, customerName, paymentMethod }
```

### Alerts
```
GET   /api/alerts
PATCH /api/alerts/:id/read
POST  /api/alerts/:id/reorder
POST  /api/alerts/reorder-all
```

### Analytics
```
GET /api/analytics/clusters?timeframe=month|3months|year
    → { clusters: { fastMoving, seasonal, slowMoving }, scatterData }
```

### Settings & Account
```
GET/PUT /api/settings     Store-level: name, currency, timezone, thresholds, tax, notifications
GET/PUT /api/account      User-level: fullName, avatar, password change
```

---

## 6. Algorithms

### 6.1 Sales Prediction — Weighted Moving Average
**File:** `server/src/services/forecastService.ts`

```
1. Query Sale records for the store, grouped by day, summed totalAmount → last 8 periods, oldest first
2. Apply exponential weights (sum = 1.0, recent periods weighted higher):
   weights = [0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.18, 0.22]
3. predictedPeriod = Σ(totals[i] × weights[i])
4. Build a forecast array for the requested range (7/14/30 days), applying a small
   growth factor per step to create a rising/falling trend line
5. trendPct = ((predictedTotal - actualPastTotal) / actualPastTotal) × 100
6. Return { labels, actualSales, predictedSales, total, trendPct } — actualSales
   contains nulls for future dates not yet observed (matches assets/mock/dashboard.json shape)

Edge case: fewer than 2 periods of sales data → return a flag the frontend
renders as "Not enough data yet" instead of a chart.
```

### 6.2 Product Clustering — K-Means (k=3)
**File:** `server/src/services/clusteringService.ts`

```
1. For each active product, over the selected timeframe:
   velocity    = mean(sales quantity per period)
   consistency = 1 − (stddev(sales quantity) / mean(sales quantity))
   Edge case: mean = 0 → velocity = 0, consistency = 0
2. Normalize both to [0, 100] via min-max normalization
3. Build feature matrix X of shape (n_products, 2)
4. If n_products < 3 → skip clustering, return all as "Unclustered"
5. Run K-Means (k=3, k-means++ init, seeded) implemented directly in TypeScript
   (no external ML dependency needed at this scale — 2 features, 3 clusters)
6. Label clusters by centroid position:
   - Highest velocity              → "Fast-Moving"
   - Lowest consistency            → "Seasonal"
   - Remaining                     → "Slow-Moving"
7. Return { x: velocity, y: consistency, productName, sku, stock } per product,
   grouped by cluster — matches assets/mock/analytics.json shape
```

### 6.3 Low-Stock Alert Generation
**File:** `server/src/services/alertService.ts`

```
For each product in a store:
  threshold = product.reorderLevel (falls back to store.lowStockThreshold if unset)

  if stock === 0:
      upsert Alert(severity="critical", message="Out of Stock! ...")
  elif stock <= threshold * 0.3:
      upsert Alert(severity="critical", message="Critical low stock...")
  elif stock <= threshold:
      upsert Alert(severity="warning", message="Stock level dropped below threshold...")
  else:
      delete any existing Alert for this product (stock is healthy)

  recommendedReorderQty = threshold * 2 − stock   (simple restock-to-buffer heuristic)

Triggered on: every sale recorded, every product edit, and once at server startup.
```

---

## 7. Multi-Tenancy & Auth Model

- Every collection except `stores` includes `storeId`.
- JWT payload: `{ userId, storeId, role }`. The `auth` middleware verifies the token, attaches `req.user` and `req.storeId`, and every service query filters by `req.storeId` — no cross-store data leakage.
- Signup creates a new `Store` + its first `User` (role `"Admin"`) in one transaction-like sequence.
- Passwords hashed with bcrypt; JWTs signed with a server-side secret (`JWT_SECRET` env var), short-lived access token (details in spec 03).

---

## 8. Environment Variables (`server/.env.example`)

```bash
NODE_ENV=development
PORT=4000

MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/shopsense

JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=7d

CORS_ORIGIN=http://localhost:5500
```

---

## 9. Implementation Order Summary

| # | Step | Builds On | Key Output | Spec |
|---|---|---|---|---|
| 1 | Backend Scaffolding | — | `npm run dev` starts Express, `/health` responds | [docs/specs/01-backend-scaffolding.md](docs/specs/01-backend-scaffolding.md) |
| 2 | Data Models | Step 1 | Mongoose schemas + indexes created against Atlas | [docs/specs/02-data-models.md](docs/specs/02-data-models.md) |
| 3 | Auth (Signup/Login/JWT) | Step 2 | Real signup/login issuing JWTs, auth middleware | [docs/specs/03-auth.md](docs/specs/03-auth.md) |
| 4 | Products CRUD API | Step 2, 3 | Full products REST API, store-scoped | [docs/specs/04-products-api.md](docs/specs/04-products-api.md) |
| 5 | Sales Recording API | Step 2, 4 | Sale creation decrements stock | [docs/specs/05-sales-api.md](docs/specs/05-sales-api.md) |
| 6 | Alert Service | Step 4, 5 | Dynamic alerts from real stock levels | [docs/specs/06-alert-service.md](docs/specs/06-alert-service.md) |
| 7 | Dashboard API + Forecast | Step 5, 6 | Live stats + weighted moving average forecast | [docs/specs/07-dashboard-forecast.md](docs/specs/07-dashboard-forecast.md) |
| 8 | Analytics API + Clustering | Step 5 | K-Means clustering endpoint | [docs/specs/08-analytics-clustering.md](docs/specs/08-analytics-clustering.md) |
| 9 | Settings & Account API | Step 2, 3 | Store settings + user account endpoints | [docs/specs/09-settings-account.md](docs/specs/09-settings-account.md) |
| 10 | Frontend Integration | All above | Every page reads live data via `/api/*`, fake auth removed | [docs/specs/10-frontend-integration.md](docs/specs/10-frontend-integration.md) |
| 11 | Testing Suite | All above | Jest + Supertest coverage per route/service | [docs/specs/11-testing.md](docs/specs/11-testing.md) |
| 12 | Hardening & Deployment | All above | Validation, error handling, CORS, seed script, deploy notes | [docs/specs/12-hardening-deployment.md](docs/specs/12-hardening-deployment.md) |

See [PLAN.md](PLAN.md) for the spec-driven development process and [TASKS.md](TASKS.md) for the actionable task list.
