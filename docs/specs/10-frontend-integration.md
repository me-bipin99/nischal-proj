# Spec 10 — Frontend Integration (Mock JSON → Live API)

## Goal
Point the existing, unchanged HTML/CSS pages at the real API instead of `assets/mock/*.json`, and replace the fake `localStorage`-only login with real JWT auth. This is the step where the app becomes genuinely dynamic end-to-end.

## Context
Every page currently calls `ShopSense.fetchData(key, mockPath)` (defined in `assets/js/common.js`), which fetches a mock JSON file and caches it in `localStorage`. `auth.js` fakes login by writing directly to `localStorage` with zero verification. This step is purely about swapping data sources — **no HTML markup or CSS changes**, since the design/layout is out of scope for this rebuild.

## Depends on
Steps 3–9 (every API endpoint must exist before its corresponding page can be wired up).

## Data contracts
No new contracts — this step consumes the ones already defined in specs 03–09. The one addition is a shared client-side convention:
```
All authenticated fetches: fetch(url, { headers: { Authorization: `Bearer ${token}` } })
token stored in localStorage under a single key, e.g. ShopSense.KEYS.AUTH_TOKEN
```

## Steps
1. In `assets/js/common.js`, add an `ShopSense.apiFetch(path, options)` helper: reads the JWT from `localStorage`, attaches the `Authorization` header, prefixes `path` with the API base URL (from a config value, e.g. `window.SHOPSENSE_API_BASE` set in each HTML page or a `<meta>` tag), and redirects to `login.html` on a `401` response.
2. Keep `ShopSense.fetchData` signature-compatible where reasonable, but have it call `apiFetch` under the hood instead of reading `assets/mock/*.json` — this minimizes changes in each page-specific JS file (`dashboard.js`, `products.js`, `sales.js`, `alerts.js`, `analytics.js`, `settings.js`, `account.js`).
3. Rewrite `assets/js/auth.js`:
   - Login form submit → `POST /api/auth/login`, store the returned `token` (and minimal user info) in `localStorage`, redirect to `dashboard.html`.
   - Signup form submit → `POST /api/auth/signup`, same token storage, redirect to `dashboard.html`.
   - Logout → clear the stored token, redirect to `login.html`.
4. Update each page-specific JS file's data-loading calls to hit the corresponding endpoint path instead of the mock path (e.g. `dashboard.js` calls `/api/dashboard/summary` and `/api/dashboard/prediction` instead of `/assets/mock/dashboard.json`).
5. Update write actions that were previously no-ops or `localStorage`-only (add product, record sale, mark alert read, reorder, save settings, save account) to make real `POST`/`PUT`/`PATCH`/`DELETE` calls via `apiFetch`, and re-fetch/re-render on success.
6. Add a lightweight route guard: on page load of any protected page, check for a stored token; if absent, redirect immediately to `login.html` (defense in depth — the API also rejects unauthenticated requests, but this avoids a flash of empty UI).
7. Leave `assets/mock/*.json` in place in the repo (useful as seed fixtures for step 12 and as test fixtures for step 11) but nothing in the running app reads them anymore.

## Acceptance criteria
- Logging in with valid credentials (created via signup) lands on the dashboard with real data rendered — no console errors, no references to `assets/mock/`.
- Logging in with wrong credentials shows an error, stays on the login page.
- Every page (dashboard, products, sales, alerts, analytics, settings, account) renders using live API data.
- Add product / record sale / mark alert read / reorder / save settings / save account all persist — a page refresh shows the change is real, not just an optimistic local update.
- Removing the token from `localStorage` and reloading any protected page redirects to login.
- Zero remaining `fetch('/assets/mock/...')` calls anywhere in `assets/js/`.

## Files created/modified
- `shopsense/assets/js/common.js`
- `shopsense/assets/js/auth.js`
- `shopsense/assets/js/dashboard.js`, `products.js`, `sales.js`, `alerts.js`, `analytics.js`, `settings.js`, `account.js`
- Each `shopsense/pages/*.html` only if an API base URL config value needs to be injected (no layout/markup changes)

## Out of scope
- Any visual/design changes to the existing pages.
- Building a new frontend framework/SPA — the existing multi-page HTML structure is preserved.
