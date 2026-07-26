# Spec 09 — Settings & Account API

## Goal
Live, store-scoped Settings and per-user Account endpoints, replacing `assets/mock/settings.json` and `assets/mock/users.json` for `pages/settings.html` and `pages/account.html`.

## Context
`settings.json` holds store-level config (name, currency, timezone, thresholds, tax, notification toggles). `users.json` holds the current user's profile. These are two different collections (`Store` and `User`) behind two different endpoints, even though today's mock data conflates "the current user" with "the shop" in the UI.

## Depends on
Step 2 (Store, User models), Step 3 (auth — `req.user`/`req.storeId`).

## Data contracts
```
GET /api/settings
  → 200 { storeName, currency, timezone, lowStockThreshold, taxRate,
          receiptFooter, notifications: { emailAlerts, lowStockAlerts,
          dailySalesSummary, weeklyForecastReport } }

PUT /api/settings
  Body: any subset of the fields above
  → 200 { ...updated settings }

GET /api/account
  → 200 { id, fullName, email, role, phone, avatar, storeName, joinedDate }
  (email is read-only in the UI; joinedDate = user's createdAt)

PUT /api/account
  Body: { fullName?, phone?, avatar?, currentPassword?, newPassword? }
  → 200 { ...updated account }
  → 401 { error: "Current password is incorrect" }   (when changing password)
```

## Steps
1. Create `server/src/services/settingsService.ts`: `getSettings(storeId)`, `updateSettings(storeId, data)` — reads/writes the `Store` document, validates `lowStockThreshold`/`taxRate` are non-negative numbers.
2. Create `server/src/services/accountService.ts`: `getAccount(storeId, userId)`, `updateAccount(storeId, userId, data)` — reads/writes the `User` document. Password change requires `currentPassword` to verify via `authService.verifyPassword` before hashing and saving `newPassword`.
3. Create `server/src/controllers/settingsController.ts` + `routes/settings.routes.ts` (`GET/PUT /api/settings`) and `server/src/controllers/accountController.ts` + `routes/account.routes.ts` (`GET/PUT /api/account`), both behind `auth`.
4. Mount both routers in `server/src/app.ts`.
5. zod validation: `email` is never accepted in the `PUT /api/account` body (read-only, ignore if present rather than erroring, to keep the client simple).

## Acceptance criteria
- Updating `storeName` via `PUT /api/settings` is reflected in a subsequent `GET /api/settings` call.
- Updating `fullName`/`phone`/`avatar` via `PUT /api/account` persists correctly.
- Changing password with the correct `currentPassword` succeeds; the old password then fails on `POST /api/auth/login`, the new one succeeds.
- Changing password with an incorrect `currentPassword` → `401`, password unchanged.
- Settings/account data never crosses between two different stores/users in tests.

## Files created/modified
- `server/src/services/settingsService.ts`, `accountService.ts`
- `server/src/controllers/settingsController.ts`, `accountController.ts`
- `server/src/routes/settings.routes.ts`, `account.routes.ts`
- `server/src/app.ts` (mount both routers)

## Out of scope
- Avatar file upload handling (multipart/S3/etc.) — `avatar` is just a URL string for now, per `PLAN.md §5`.
