# RentOut

RentOut is a leasing operations suite for internal property, leasing, and screening teams. The app now stands on four operational layers:

- operator auth and session management
- property operations
- CRM pipeline
- applicant screening

It runs as a single Express service with a static dashboard. Local development can use SQLite. Render production should use Postgres through `DATABASE_URL`.

## What is implemented

- operator accounts with roles
- password-based login
- TOTP MFA enrollment and step-up verification
- recovery-code based fallback sign-in
- HTTP-only session cookies
- audit logs for login/logout and all write routes
- property portfolio, units, leases, and work orders
- CRM prospects, stage movement, and next actions
- screening policies and applications with stored decisions
- Buildium PMS connection testing and sync into portfolio tables
- dual database runtime:
  - SQLite for local dev
  - Postgres for production
- Render blueprint in `render.yaml`

## Operator model

Roles:

- `viewer`: read-only access
- `operator`: read and write access
- `admin`: read, write, and operator-admin access

Bootstrap:

- On first startup, if no operators exist, the app requires:
  - `OPERATOR_BOOTSTRAP_EMAIL`
  - `OPERATOR_BOOTSTRAP_PASSWORD`
- That bootstrap operator is created as `admin`.

Session model:

- Login uses email and password.
- MFA-enabled operators complete login with an authenticator code or a one-time recovery code.
- Session state is stored in `auth_sessions`.
- One-time MFA challenges are stored in `auth_login_challenges`.
- The browser uses an HTTP-only cookie named `rentout_session`.
- Session expiry is controlled by `SESSION_TTL_DAYS`.

Audit logging:

- Auth events are logged:
  - login
  - logout
- All write routes are logged with:
  - operator id
  - action
  - entity type
  - entity id
  - request id
  - IP and user agent
  - sanitized request payload

## Local development

```bash
git clone https://github.com/robs46859-eng/rentout.git
cd rentout
npm install
cp .env.example .env
npm run seed
OPERATOR_BOOTSTRAP_EMAIL=admin@rentout.local \
OPERATOR_BOOTSTRAP_PASSWORD='change-this-now' \
npm start
```

Open `http://127.0.0.1:3847` and sign in with the bootstrap operator.

`npm run seed` resets operational demo data. It does not create operator accounts.

## Environment

The canonical source of truth for environment variables is `env.schema.json`. Use the helper scripts in `scripts/` to validate env payloads and sync Render service variables.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port. Default `3847`. |
| `HOST` | Bind host. Use `127.0.0.1` locally, `0.0.0.0` in containers. |
| `DATABASE_URL` | Production Postgres connection string. When set, the app uses Postgres instead of SQLite. |
| `PGSSL` | Set `true` if your Postgres connection requires SSL. |
| `SQLITE_PATH` | Optional SQLite file path for local/dev runtime. |
| `SESSION_TTL_DAYS` | Session duration in days. Default `14`. |
| `MFA_ISSUER` | Label shown in authenticator apps. Default `RentOut`. |
| `MFA_CHALLENGE_TTL_MINUTES` | MFA challenge lifetime. Default `10`. |
| `OPERATOR_BOOTSTRAP_EMAIL` | Required on first startup when no operators exist. |
| `OPERATOR_BOOTSTRAP_PASSWORD` | Required on first startup when no operators exist. |
| `OPERATOR_BOOTSTRAP_NAME` | Optional display name for the bootstrap admin. |
| `RENTCAST_API_KEY` | Enables live average-rent pulls. |
| `CENSUS_API_KEY` | Optional Census key for higher ACS reliability. |
| `BUILDIUM_BASE_URL` | Buildium API base URL. Default `https://api.buildium.com`. |
| `BUILDIUM_CLIENT_ID` | Buildium Open API client ID. |
| `BUILDIUM_CLIENT_SECRET` | Buildium Open API client secret. |
| `MARKET_ZIP` | ZIP used for RentCast rent lookup. |
| `MARKET_STATE_FIPS` | Census state FIPS code. |
| `MARKET_PLACE` | Census place FIPS code. |
| `DEMO_RADIUS_MILES` | Radius displayed in demographics. |

## Product surface

### Dashboard

- Operations: portfolio summary, unit readiness, leases, work orders
- CRM: funnel counts, active prospects, next actions
- Screening: policy thresholds, applications, decision reasons
- Market: average rent, occupancy proxy, heat score, geography
- Workflow: job state and cache/system health
- SEO: listing-channel scorecards and keyword clusters
- Admin: operator management, audit review, Buildium connection test, PMS sync

### Core entities

- `operators`
- `auth_sessions`
- `auth_login_challenges`
- `audit_logs`
- `integration_accounts`
- `integration_sync_runs`
- `assets`
- `units`
- `maintenance_snapshots`
- `leases`
- `work_orders`
- `crm_prospects`
- `crm_activities`
- `screening_policies`
- `screening_applications`
- `workflow_jobs`
- `cache_health`
- `seo_channels`
- `market_snapshots`
- `demographic_snapshots`

## API

| Method | Path | Purpose | Minimum role |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Liveness probe | public |
| `POST` | `/api/auth/login` | Start operator session | public |
| `POST` | `/api/auth/mfa/verify` | Complete MFA challenge and issue session | public |
| `POST` | `/api/auth/logout` | End operator session | authenticated |
| `GET` | `/api/session` | Validate current operator session | authenticated |
| `POST` | `/api/v1/account/password/change` | Rotate current operator password | viewer |
| `POST` | `/api/v1/account/mfa/setup` | Start MFA enrollment and issue recovery codes | viewer |
| `POST` | `/api/v1/account/mfa/verify` | Confirm MFA enrollment | viewer |
| `POST` | `/api/v1/account/mfa/disable` | Disable MFA after password and MFA verification | viewer |
| `GET` | `/api/v1/consolidated` | Full dashboard payload | viewer |
| `GET` | `/api/v1/property/portfolio` | Property-management snapshot | viewer |
| `POST` | `/api/v1/property/work-orders` | Create a work order | operator |
| `PATCH` | `/api/v1/property/work-orders/:id` | Update work order | operator |
| `GET` | `/api/v1/crm/pipeline` | CRM pipeline snapshot | viewer |
| `POST` | `/api/v1/crm/prospects` | Create a prospect | operator |
| `POST` | `/api/v1/crm/prospects/:id/activities` | Log or schedule activity | operator |
| `PATCH` | `/api/v1/crm/prospects/:id/stage` | Move a prospect through funnel | operator |
| `GET` | `/api/v1/screening/overview` | Screening policy and application view | viewer |
| `POST` | `/api/v1/screening/applications` | Create screening application | operator |
| `PATCH` | `/api/v1/screening/applications/:id/decision` | Record screening decision | operator |
| `GET` | `/api/v1/admin/operators` | List operators | admin |
| `POST` | `/api/v1/admin/operators` | Create operator | admin |
| `PATCH` | `/api/v1/admin/operators/:id` | Update operator access and active state | admin |
| `POST` | `/api/v1/admin/operators/:id/reset-password` | Reset operator password and optionally clear MFA | admin |
| `GET` | `/api/v1/admin/integrations/pms` | Read Buildium integration status and recent sync runs | admin |
| `POST` | `/api/v1/admin/integrations/pms/test` | Validate Buildium credentials | admin |
| `POST` | `/api/v1/admin/integrations/pms/sync` | Import properties, units, leases, and work orders from Buildium | admin |
| `GET` | `/api/v1/admin/audit-logs` | Read audit trail | admin |

## Render deployment

This repo includes `render.yaml` for:

- one Node web service
- one managed Postgres database
- injected `DATABASE_URL`
- bootstrap operator secrets

Recommended Render setup:

1. Create the Render blueprint from this repo.
2. Let Render provision the Postgres database.
3. Set:
   - `OPERATOR_BOOTSTRAP_EMAIL`
   - `OPERATOR_BOOTSTRAP_PASSWORD`
   - `MFA_ISSUER`
   - `BUILDIUM_CLIENT_ID`
   - `BUILDIUM_CLIENT_SECRET`
4. Keep `HOST=0.0.0.0`.
5. Use Postgres in production. Do not run Render on SQLite.
6. Use the Admin section after first login to test the Buildium connection and run the initial PMS sync.

## Env automation

This repo includes a schema-driven env automation layer:

- `env.schema.json` defines required variables, defaults, and which values sync to Render
- `npm run env:schema` validates the schema itself
- `npm run env:validate -- --env staging` validates a concrete env payload
- `npm run env:sync:render -- --env staging --dry-run` previews Render changes
- `npm run env:sync:render -- --env staging` applies them

CI automation:

- `.github/workflows/validate-env-schema.yml` validates the schema on push and pull request
- `.github/workflows/render-env-sync.yml` syncs Render variables from GitHub Environment secrets and vars

See `docs/env-automation.md` for setup details.

## Notes

- `docs/launch-audit.md` captures the current suite audit.
- `docs/env-automation.md` documents schema-driven env management and Render sync.
- This is now a real internal operator auth model with MFA, recovery codes, password rotation, and audited admin controls.
- It now includes a real Buildium PMS ingestion path, but it still does not provide customer-facing tenant auth or external screening vendor integration.
