# Spec 03 — Auth: Signup, Login, JWT

## Goal
Replace the frontend's fake `localStorage`-only login (`shopsense/assets/js/auth.js`) with real authentication: signup creates a `Store` + first `User`, login verifies credentials and issues a JWT, and a reusable middleware protects all other routes.

## Context
Today, `auth.js` just writes `{ loggedIn: true, ... }` into `localStorage` on any form submit — there is no verification at all. This step builds the real thing it will be swapped in for. This app is multi-tenant: signup is how a *new store* gets created, not just a new user under an existing one.

## Depends on
Step 2 (Store and User models must exist).

## Data contracts
```
POST /api/auth/signup
  Body: { fullName: string, email: string, password: string, storeName: string }
  → 201 { token: string, user: { id, fullName, email, role, storeId } }
  → 409 { error: "Email already in use" }

POST /api/auth/login
  Body: { email: string, password: string }
  → 200 { token: string, user: { id, fullName, email, role, storeId } }
  → 401 { error: "Invalid email or password" }
```

JWT payload: `{ userId, storeId, role, iat, exp }`, signed with `JWT_SECRET`, expiry from `JWT_EXPIRES_IN` (default `7d`).

## Steps
1. Create `server/src/services/authService.ts`:
   - `hashPassword(plain)` → bcrypt hash (cost factor 10+)
   - `verifyPassword(plain, hash)` → boolean
   - `signup(fullName, email, password, storeName)` → creates a `Store` document, then a `User` with `role: "Admin"` linked to it, returns both
   - `login(email, password)` → looks up user by email, verifies password, throws a typed `AuthError` on failure
   - `issueToken(user)` → signs and returns a JWT
2. Create `server/src/middleware/auth.ts` — reads `Authorization: Bearer <token>`, verifies it, attaches `req.user = { userId, storeId, role }` to the request; responds `401` if missing/invalid/expired.
3. Create `server/src/controllers/authController.ts` and `server/src/routes/auth.routes.ts` wiring `POST /api/auth/signup` and `POST /api/auth/login` to the service, translating service errors to the HTTP responses in the data contract above.
4. Mount the `auth` router in `server/src/app.ts` under `/api/auth` — these two routes are the only ones NOT behind the `auth` middleware.
5. Apply the `auth` middleware to every other router mounted from this point forward (products, sales, alerts, analytics, dashboard, settings) — do this by mounting them through a shared "protected router" or applying the middleware per-router as each is added in later steps.
6. Add basic input validation (zod schema) for signup/login bodies — reject empty/malformed email or short passwords with `400`.

## Acceptance criteria
- `POST /api/auth/signup` with a new email creates a `Store` and a `User`, returns a valid JWT.
- Signing up twice with the same email returns `409`, no duplicate `User` created.
- `POST /api/auth/login` with correct credentials returns a JWT; wrong password or unknown email both return a generic `401` (don't leak which one was wrong).
- A request to any protected route (once step 4+ routes exist) without a valid `Authorization` header returns `401`.
- Decoding a returned JWT shows the expected `{ userId, storeId, role }` payload.

## Files created/modified
- `server/src/services/authService.ts`
- `server/src/middleware/auth.ts`
- `server/src/controllers/authController.ts`
- `server/src/routes/auth.routes.ts`
- `server/src/app.ts` (mount auth router)

## Out of scope
- Password reset / forgot-password flow (deferred per `PLAN.md §5` — not part of this rebuild unless separately requested).
- Refresh tokens / token revocation — a single long-lived JWT is enough at this stage (see `PLAN.md §5`).
- Frontend wiring of `auth.js` to these endpoints — that's step 10.
