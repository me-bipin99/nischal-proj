# ShopSense — Rebuild Plan (Static → Node.js + MongoDB)

> Companion to [ARCHITECTURE.md](ARCHITECTURE.md) (system design) and [TASKS.md](TASKS.md) (actionable task list).
> This document explains the *process* — how the rebuild is broken down and why — so any step can be picked up independently without re-reading the whole history of decisions behind it.

---

## 1. Why spec-driven development for this rebuild

The rebuild touches auth, multi-tenant data scoping, two non-trivial algorithms (forecasting, clustering), and a full CRUD surface — too much to hold in one head or one conversation without losing context partway through. Instead of one big implementation plan, **every step in the Implementation Order (ARCHITECTURE.md §9) gets its own spec file under `docs/specs/`.**

Each spec is self-contained: someone (or some future session) opening `docs/specs/06-alert-service.md` should be able to implement that step correctly without needing to have read specs 01–05 first, beyond the shared context already captured in `ARCHITECTURE.md`. That's the point — context doesn't leak only through conversation memory, it's written down once per step, in the place where it's needed.

## 2. What every spec contains

To keep specs consistent and genuinely self-contained, each one follows the same shape:

1. **Goal** — one paragraph, what this step delivers and why it matters
2. **Depends on** — which earlier steps must already be done, and what they provide
3. **Data contracts** — exact request/response JSON shapes, Mongoose schema fields touched
4. **Steps** — ordered implementation checklist
5. **Acceptance criteria** — concrete, testable "done when" conditions (not vibes)
6. **Files created/modified** — exact paths
7. **Out of scope** — explicitly what NOT to build yet, to prevent scope creep into later steps

## 3. Build order and dependency chain

```
1. Backend Scaffolding
        │
2. Data Models
        │
   ┌────┴────┐
   3. Auth   │
   │         │
4. Products CRUD
        │
5. Sales Recording
        │
   ┌────┴─────┐
6. Alerts   7. Dashboard/Forecast   8. Analytics/Clustering
   │            │                      │
   └─────┬──────┴──────────────────────┘
         │
9. Settings & Account (depends only on 2, 3 — can run in parallel with 4-8)
         │
10. Frontend Integration (needs all API steps done)
         │
11. Testing Suite (written alongside each step in practice — see note below)
         │
12. Hardening & Deployment
```

**Note on step 11 (Testing):** in practice, tests are written *as part of* each step (2 through 9), following the repo's TDD conventions — `docs/specs/11-testing.md` documents the shared testing conventions and fixtures (mongodb-memory-server setup, auth helpers for tests) rather than being a separate phase bolted on at the end. Treat it as a reference doc, not something to defer.

## 4. Working through a step

For each numbered step:

1. Read the step's spec in `docs/specs/`.
2. Confirm its "Depends on" items are actually done (check `TASKS.md` status).
3. Implement following the spec's Steps checklist.
4. Verify against Acceptance Criteria before marking the task done in `TASKS.md`.
5. If the spec turns out to be wrong or incomplete once you're implementing it, **update the spec file itself**, don't just silently diverge — the spec is the record of what was actually decided and why.

## 5. What's explicitly deferred (YAGNI)

Not part of this rebuild unless separately requested:
- Real email delivery for password reset (dev flow prints/returns the token)
- File upload storage for avatars beyond a local `uploads/` folder
- Payment processing integration (payment method is just a recorded string)
- Real-time updates (websockets/polling) — dashboard refreshes on page load only
- Role-based permission granularity beyond Admin/Manager/Staff labels
- Production infra beyond a single Node process + MongoDB Atlas (no k8s, no queues)

## 6. Legacy documents

The previous `ARCHITECTURE.md`/`TASKS.md` describing a Flask + SQLAlchemy + SQL plan for a kirana-store data model has been fully replaced — it predated the MongoDB decision and didn't match the actual prototype's data shapes (USD invoices vs. weekly ₹ aggregates). No content from it carries forward except the general algorithm *concepts* (weighted moving average forecasting, K-Means-style clustering, threshold-based alerts), which are reimplemented here in TypeScript against the real mock-data shapes.
