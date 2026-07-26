# Spec 12 — Hardening & Deployment

## Goal
Close remaining gaps before treating the rebuild as done: validation coverage, error handling, a seed script for realistic dev data, and a documented deployment path.

## Context
This is the final step, once every API and the frontend integration are in place. It mirrors the polish pass the old (replaced) `TASKS.md` called "Final Wiring & Polish," adapted to this stack.

## Depends on
Steps 1–11 (all prior work must exist).

## Data contracts
No new endpoints. This step adds cross-cutting middleware and a seed script.

## Steps

### Validation & error handling
1. Audit every route from steps 3–9 — confirm each has a zod schema validating its request body/query params, applied via a shared `validate(schema)` middleware (`server/src/middleware/validate.ts`).
2. Create `server/src/middleware/errorHandler.ts` — a single Express error-handling middleware (mounted last) that catches thrown errors, maps known error types (validation, not-found, duplicate-key, auth) to appropriate status codes, and returns a consistent `{ error: string }` JSON shape. Logs unexpected errors server-side but never leaks stack traces to the client.
3. Add a catch-all `404` JSON handler for unmatched API routes (distinct from the frontend's own error pages, which are just static HTML per the existing prototype).

### Security
4. Confirm CORS is locked to `CORS_ORIGIN` from env, not a wildcard, in production.
5. Add basic rate limiting on `/api/auth/login` and `/api/auth/signup` (e.g. `express-rate-limit`) to blunt credential-stuffing/spam signups.
6. Confirm no route bypasses the `auth` middleware except the two auth endpoints themselves.
7. Confirm `passwordHash` and other sensitive fields are excluded from any JSON response (`toJSON` transform on the `User` model, or explicit `.select('-passwordHash')`).

### Seed data
8. Create `server/seed.ts` — connects to the configured MongoDB, wipes existing data (dev/test only — refuse to run if `NODE_ENV=production`), creates one store, one admin user, and imports the products/sales/alerts shapes from `shopsense/assets/mock/*.json` as a realistic starting dataset. Add `"seed": "ts-node seed.ts"` to `package.json`.

### Deployment
9. Document a minimal production deployment path in a new `server/DEPLOYMENT.md`: build (`npm run build`), run (`node dist/index.js` under a process manager like `pm2` or a platform's built-in one), environment variables required, and how `CORS_ORIGIN` / `MONGODB_URI` change for production vs. dev.
10. Pin exact dependency versions in `server/package.json` (no loose `^`/`~` ranges for anything security-sensitive like `jsonwebtoken`, `bcrypt`).

## Acceptance criteria
- Submitting any invalid request body to any endpoint returns a `400` with a clear message, never an unhandled exception or `500`.
- Triggering an unexpected server error (e.g. temporarily disconnect the DB) returns a generic `500` JSON error, not a leaked stack trace.
- Repeated rapid login attempts against `/api/auth/login` eventually get rate-limited.
- No API response ever includes `passwordHash`.
- `npm run seed` populates a clean database with one store's worth of realistic products/sales/alerts, viewable immediately by logging in with the seeded credentials.
- `server/DEPLOYMENT.md` is sufficient for someone unfamiliar with the project to deploy it.

## Files created/modified
- `server/src/middleware/errorHandler.ts`, `validate.ts` (finalized across all routes)
- `server/seed.ts`
- `server/DEPLOYMENT.md`
- `server/package.json` (pinned versions, seed script)

## Out of scope
- Containerization (Docker), CI/CD pipelines, or orchestration — not requested; add only if separately asked for (per `PLAN.md §5`).
