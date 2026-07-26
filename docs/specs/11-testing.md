# Spec 11 — Testing Suite Conventions

## Goal
Establish shared testing infrastructure and conventions so each API step (3–9) ships with real, isolated tests rather than tests being an afterthought. This spec is a **reference doc**, consulted while implementing steps 3–9, not a standalone phase done only at the end (see `PLAN.md §3` note).

## Context
Tests must not depend on a shared live MongoDB Atlas cluster — that would make test runs flaky, slow, and mutate real dev data. `mongodb-memory-server` spins up an ephemeral in-memory MongoDB instance per test run.

## Depends on
Step 1 (project scaffolding — tests live alongside `server/src`).

## Data contracts
N/A — this spec defines tooling and conventions, not API shapes.

## Steps
1. Install dev dependencies: `jest`, `ts-jest`, `@types/jest`, `supertest`, `@types/supertest`, `mongodb-memory-server`.
2. Create `server/jest.config.js` (or `jest.config.ts`) using `ts-jest` preset, test match pattern `**/*.test.ts`.
3. Create `server/tests/setup.ts`: starts an in-memory MongoDB instance before all tests (`beforeAll`), connects Mongoose to it, clears all collections between tests (`afterEach`), stops the instance after all tests (`afterAll`).
4. Create `server/tests/helpers/auth.ts`: a reusable `createTestUser()` helper that signs up a store+user directly via `authService` (not HTTP) and returns a valid JWT for use in `Authorization` headers in other tests — avoids repeating signup boilerplate in every test file.
5. Convention: one test file per route module, named `server/tests/<feature>.test.ts` (e.g. `products.test.ts`, `sales.test.ts`), using `supertest(app)` against the real Express app (not a running server) for HTTP-level tests.
6. Convention: pure business logic (forecastService's weighted-average math, clusteringService's K-Means) gets **unit tests** with hand-crafted input arrays and known expected outputs — not just integration tests through the HTTP layer, since these algorithms are easy to get subtly wrong and hard to debug through a full request/response cycle.
7. Add `"test": "jest"` and `"test:watch": "jest --watch"` scripts to `server/package.json`.
8. As each of steps 3–9 is implemented, its acceptance criteria (already written in that step's spec) become the test cases — write the test, watch it fail against a stub, then implement until it passes (standard TDD loop).

## Acceptance criteria
- `cd server && npm test` runs the full suite against the in-memory MongoDB, with no dependency on `MONGODB_URI` pointing to Atlas.
- Test runs are fully isolated — running the suite twice in a row produces identical results (no leftover state from a previous run causing duplicate-key failures).
- Every acceptance criterion listed in specs 03–09 has at least one corresponding automated test.
- `forecastService` and `clusteringService` have dedicated unit tests with known input → expected output pairs, independent of the HTTP layer.

## Files created/modified
- `server/jest.config.js`
- `server/tests/setup.ts`
- `server/tests/helpers/auth.ts`
- `server/tests/*.test.ts` (one per feature, added incrementally alongside steps 3–9)
- `server/package.json` (test scripts)

## Out of scope
- End-to-end browser tests against the actual frontend pages — this spec covers API-level testing only.
