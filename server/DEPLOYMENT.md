# Deployment

Minimal path to run the ShopSense API in production.

## Build & run

```bash
npm ci
npm run build        # compiles src/**/*.ts -> dist/**/*.js via tsc
node dist/index.js    # start the server
```

For a long-running production process, run it under a process manager
instead of a bare `node` invocation, e.g. [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start dist/index.js --name shopsense-api
pm2 save
```

(Any process manager works — pm2, systemd, or your platform's own
process supervisor, e.g. Render/Railway/Fly's built-in restart-on-crash.
The only requirement is that `dist/` has been built first via `npm run build`.)

## Required environment variables

Set these in the deployment environment (e.g. a `.env` file loaded by the
platform, or the platform's secret/config manager — do not commit real
secrets to source control). See `.env.example` for a template.

| Variable | Description |
|---|---|
| `NODE_ENV` | `production` in production. Also gates `seed.ts`, which refuses to run when this is `production`. |
| `PORT` | TCP port the HTTP server listens on. |
| `MONGODB_URI` | MongoDB connection string (see below for dev vs. prod). |
| `JWT_SECRET` | Secret used to sign/verify auth JWTs. Use a long, random value in production — never reuse the dev default. |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d`. Optional — defaults to `7d` if unset. |
| `CORS_ORIGIN` | The single origin allowed to call this API via CORS (see below). Optional — defaults to `http://localhost:5500` if unset, which is only appropriate for local dev. |

## Dev vs. production differences

**`MONGODB_URI`**
- Dev: a local `mongod` instance, e.g. `mongodb://localhost:27017/nix-proj`.
- Production: a managed cluster connection string, e.g. MongoDB Atlas —
  `mongodb+srv://<user>:<password>@<cluster-host>/<db-name>?retryWrites=true&w=majority`.
  Create a dedicated database user scoped to this database only, and
  restrict network access (IP allowlist / VPC peering) to the deploying
  service.

**`CORS_ORIGIN`**
- Dev: the local frontend origin, e.g. `http://localhost:5500`.
- Production: the real deployed frontend origin (its exact scheme + host
  + port, e.g. `https://app.example.com`), and only that origin — the API
  never sets `cors({ origin: "*" })`. If the frontend is later served from
  multiple origins, this needs to become a small allowlist instead of a
  single string.

## Notes

- `npm run build` type-checks the whole project (`tsc`); a broken build
  fails before anything ships.
- `npm run seed` populates a store, an Admin user, and sample
  products/sales/alerts for local development — it is a dev/test
  convenience only and refuses to run when `NODE_ENV=production`. Do not
  run it against a production database.
- The server logs unexpected errors server-side (`console.error`) but
  never returns stack traces or internal error details to clients — 500
  responses always return a generic `{"error":"Internal server error"}`.
