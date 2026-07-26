# Spec 01 — Backend Scaffolding & Express Setup

## Goal
Stand up a minimal, running Express + TypeScript server connected to MongoDB Atlas, with the folder structure the rest of the rebuild will fill in. No business logic yet — just proof that the server boots, connects to the DB, and responds to a health check.

## Context
This project currently has **no backend at all** — `shopsense/` is a static frontend reading `assets/mock/*.json`. This is the first step of a 12-step rebuild described in `ARCHITECTURE.md` and `PLAN.md`. There is also a leftover, unrelated `package.json`/`tsconfig.json`/`vite.config.ts` at the repo root from an unused AI Studio React scaffold (`src/App.tsx` is an empty component) — do not build on top of that; the new backend lives entirely in a new `server/` directory with its own `package.json`.

## Depends on
Nothing — this is the first step.

## Data contracts
```
GET /health
  → 200 { status: "ok", db: "connected" | "disconnected" }
```

## Steps
1. Create `server/` directory with its own `package.json` (separate from the root one).
2. Install dependencies: `express`, `mongoose`, `dotenv`, `cors`.
3. Install dev dependencies: `typescript`, `ts-node-dev`, `@types/node`, `@types/express`, `@types/cors`.
4. Create `server/tsconfig.json` targeting Node (CommonJS or ESM — pick one, be consistent), `strict: true`.
5. Create `server/src/config/env.ts` — reads and validates required env vars (`MONGODB_URI`, `JWT_SECRET`, `PORT`), throws a clear error at startup if any are missing.
6. Create `server/src/config/db.ts` — exports `connectDB()` using `mongoose.connect(process.env.MONGODB_URI)`.
7. Create `server/src/app.ts` — Express app factory: JSON body parsing, `cors()` middleware (origin from `CORS_ORIGIN` env var), a `GET /health` route.
8. Create `server/src/index.ts` — calls `connectDB()`, then `app.listen(PORT)`.
9. Create `server/.env.example` with `NODE_ENV`, `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN` (see `ARCHITECTURE.md §8`).
10. Add `dev`, `build`, `start` scripts to `server/package.json` (`ts-node-dev src/index.ts`, `tsc`, `node dist/index.js`).
11. Add `server/.gitignore` covering `node_modules/`, `dist/`, `.env`.

## Acceptance criteria
- `cd server && npm install && npm run dev` starts the server without errors.
- `GET http://localhost:4000/health` returns `{ status: "ok", db: "connected" }` when `MONGODB_URI` points to a real (even empty) Atlas cluster.
- Starting the server with a missing/invalid `MONGODB_URI` fails fast with a clear error message, not a silent hang.
- `npm run build && npm start` (compiled JS) also serves `/health` correctly.

## Files created/modified
- `server/package.json`, `server/tsconfig.json`, `server/.env.example`, `server/.gitignore`
- `server/src/index.ts`, `server/src/app.ts`
- `server/src/config/env.ts`, `server/src/config/db.ts`

## Out of scope
- No routes beyond `/health` yet.
- No auth, no models — those are steps 2 and 3.
- Do not modify anything under `shopsense/` in this step.
