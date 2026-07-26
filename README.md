# ShopSense

Retail inventory & sales intelligence platform: an Express/TypeScript/MongoDB
API backing a static HTML/JS frontend. Tracks stock levels, records sales,
forecasts near-term demand, and clusters products by sales velocity.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design.

## Prerequisites

- Node.js 18+
- A running MongoDB instance — either a local `mongod` or a MongoDB Atlas
  connection string

## Setup

1. Clone the repo and install dependencies (root + server):

   ```bash
   npm install
   npm run install:all
   ```

2. Create your server environment file from the template and fill in real
   values:

   ```bash
   cp server/.env.example server/.env
   ```

   | Variable | Description |
   |---|---|
   | `NODE_ENV` | `development` locally. |
   | `PORT` | Port the API listens on (default `4000`). |
   | `MONGODB_URI` | e.g. `mongodb://localhost:27017/nix-proj` for a local `mongod`, or an Atlas `mongodb+srv://...` string. |
   | `JWT_SECRET` | Any long random string — used to sign auth tokens. |
   | `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d`. Optional, defaults to `7d`. |
   | `CORS_ORIGIN` | Frontend origin allowed to call the API. Optional, defaults to `http://localhost:5500`. |

   `MONGODB_URI`, `JWT_SECRET`, and `PORT` are required — the server refuses
   to start without them.

3. Make sure MongoDB is running (skip if using Atlas):

   ```bash
   mongod
   ```

## Run

From the repo root, this starts the API (port 4000) and serves the static
frontend (port 5500) together:

```bash
npm run dev
```

Then open http://localhost:5500 in a browser.

To run either piece on its own:

```bash
npm run dev --prefix server   # API only, http://localhost:4000
npx serve shopsense -l 5500   # frontend only
```

## Seed data

Populate the database with sample products/sales/users:

```bash
npm run seed --prefix server
```

(Refuses to run when `NODE_ENV=production`.)

## Tests

```bash
npm test --prefix server
```

## Deployment

See [server/DEPLOYMENT.md](server/DEPLOYMENT.md) for building and running the
API in production.
