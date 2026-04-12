# RentOut

Leasing operations dashboard for **leasing agents** and **renters**: property and unit data, maintenance and lease terms, market analytics, demographics, background job status, cache health, and SEO distribution metrics. The server exposes a **single consolidated JSON** endpoint that the static HTML client consumes.

## Features

| Area | Description |
|------|-------------|
| **Property management** | Assets, units, open tickets / damages, lease history (schedules, clauses, parking, storage). |
| **Market analytics** | Average rent, occupancy, heat score, submarket identifiers — backed by seeded data and optional [RentCast](https://www.rentcast.io/) API. |
| **Demographics** | Radius, median household income, vacancy rate — [US Census ACS](https://www.census.gov/data/developers/data-sets/acs-5year.html) with graceful fallback. |
| **Workflow** | Job name, step (e.g. 4/6), status (Running / Queued / Partial), neural and CPU load proxies. |
| **System health** | L1 / L2 / L3 cache percentages and memory usage (populate from your workers or metrics agent). |
| **SEO & distribution** | Per-channel local SEO score, distribution %, listing completeness, keyword clusters (ready to wire to GA, GSC, or ListHub). |

The UI follows the **Industrial Precision & Retro-Futurism** design system (Space Grotesk + Inter, dark surfaces, kinetic orange accents, 0px radius). Align custom pages with your project’s `DESIGNMASTER.md` if you maintain one alongside this repo.

## Tech stack

- **Runtime:** Node.js 18+
- **Server:** Express
- **Database:** SQLite (`better-sqlite3`), file under `data/rentout.sqlite` — schema can be ported to PostgreSQL or MongoDB for production scale and PMS sync.

## Quick start

```bash
cd RentOut
npm install
cp .env.example .env   # optional: add API keys
npm run seed
npm start
```

Open **http://127.0.0.1:3847** (or the host/port you set). Use `npm run dev` for a watched server process.

## Environment variables

Copy `.env.example` to `.env`. Common variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `3847`). |
| `SQLITE_PATH` | Optional absolute path to the SQLite file. |
| `RENTCAST_API_KEY` | Enables live market pulls from RentCast; without it, market fields use seed/mock values. |
| `EXTERNAL_REAL_ESTATE_PROVIDER` | Reserved label for switching providers (e.g. ATTOM, CoreLogic). |
| `CENSUS_API_KEY` | Optional; improves Census API rate limits. Many ACS requests work without a key. |
| `MARKET_ZIP` | ZIP used when querying RentCast. |
| `MARKET_STATE_FIPS` | Two-digit state FIPS (e.g. `08` for Colorado). |
| `MARKET_PLACE` | Place FIPS for Census place geography (default targets Denver; adjust for your market). |
| `DEMO_RADIUS_MILES` | Display radius for demographic summary. |

Adjust `server/services/market.js` if your RentCast product uses different endpoints or parameters.

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness: `{ ok, service, time }`. |
| `GET` | `/api/v1/consolidated` | Full dashboard payload: property management, merged market + demographics, workflow, cache, SEO. |

Example:

```bash
curl -s http://127.0.0.1:3847/api/v1/consolidated | jq .
```

## Project layout

```
RentOut/
├── .env.example
├── package.json
├── server/
│   ├── index.js              # Express app, static files, routes
│   ├── db.js                 # SQLite connection + migrations
│   ├── seed.js               # Sample data
│   └── services/
│       ├── consolidated.js   # Builds merged JSON response
│       ├── market.js         # RentCast / fallback
│       └── demographics.js   # Census ACS / fallback
├── public/
│   ├── index.html
│   ├── css/app.css
│   └── js/app.js
└── data/                     # Created at runtime (gitignored)
    └── rentout.sqlite
```

## Integrating external systems

- **PMS (Yardi, AppFolio, Buildium):** Map sync jobs to `assets`, `units`, `maintenance_snapshots`, and `leases` — no API routes are included for writes; add authenticated POST/PATCH handlers or a separate worker.
- **Task queues (Celery, Bull, SQS):** Replace or augment `workflow_jobs` and `cache_health` rows with real queue depth, step state, and host metrics.
- **Analytics / SEO:** Replace `seo_channels` seed data with periodic jobs that call Google Analytics, Search Console, or syndication partners.

## Scripts

| Script | Command |
|--------|---------|
| Start | `npm start` |
| Dev (watch) | `npm run dev` |
| Reseed database | `npm run seed` |

## License

Private / unpublished unless you add a license file.
