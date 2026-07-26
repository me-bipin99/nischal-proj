# ShopSense — Implementation Tasks

> Task index for the Node.js + Express + MongoDB rebuild. Each task links to a full self-contained spec in `docs/specs/` — read the spec before implementing, don't work from this summary alone.
> See [PLAN.md](PLAN.md) for the spec-driven process and [ARCHITECTURE.md](ARCHITECTURE.md) for the system design.
> Complete tasks in order — each one builds on the previous (dependency chain in `PLAN.md §3`).

| # | Status | Task | Spec |
|---|---|---|---|
| 1 | ✅ Done | Backend Scaffolding & Express Setup (dev and compiled server both verified against local MongoDB at `mongodb://localhost:27017/nix-proj`; `/health` returns `{status:"ok",db:"connected"}`) | [docs/specs/01-backend-scaffolding.md](docs/specs/01-backend-scaffolding.md) |
| 2 | ✅ Done | Data Models (Mongoose Schemas) | [docs/specs/02-data-models.md](docs/specs/02-data-models.md) |
| 3 | ✅ Done | Auth — Signup, Login, JWT | [docs/specs/03-auth.md](docs/specs/03-auth.md) |
| 4 | ✅ Done | Products CRUD API | [docs/specs/04-products-api.md](docs/specs/04-products-api.md) |
| 5 | ✅ Done | Sales Recording API | [docs/specs/05-sales-api.md](docs/specs/05-sales-api.md) |
| 6 | ✅ Done | Alert Service — Dynamic Low-Stock Detection | [docs/specs/06-alert-service.md](docs/specs/06-alert-service.md) |
| 7 | ✅ Done | Dashboard API & Sales Forecast | [docs/specs/07-dashboard-forecast.md](docs/specs/07-dashboard-forecast.md) |
| 8 | ✅ Done | Analytics API & Product Clustering | [docs/specs/08-analytics-clustering.md](docs/specs/08-analytics-clustering.md) |
| 9 | ✅ Done | Settings & Account API | [docs/specs/09-settings-account.md](docs/specs/09-settings-account.md) |
| 10 | ✅ Done | Frontend Integration (mock JSON → live API) | [docs/specs/10-frontend-integration.md](docs/specs/10-frontend-integration.md) |
| 11 | ✅ Done | Testing Suite Conventions (64 Jest tests across 10 files, `mongodb-memory-server`-backed, `npm test` green) | [docs/specs/11-testing.md](docs/specs/11-testing.md) |
| 12 | ✅ Done | Hardening & Deployment (shared `validate`/`errorHandler` middleware, JSON 404, auth rate limiting, `passwordHash` stripped via `toJSON`, `seed.ts`, `DEPLOYMENT.md`; 64/64 tests green) | [docs/specs/12-hardening-deployment.md](docs/specs/12-hardening-deployment.md) |

**Status legend:** ⬜ Not started · 🟨 In progress · ✅ Done

Update the status column as work progresses — this table is the single source of truth for "what's left."
