# Env Automation

This project now treats environment management as a versioned system instead of a loose `.env` file convention.

## Files

- `env.schema.json`
  - source of truth for required variables, defaults, sensitivity, and Render sync eligibility
- `scripts/validate-env.js`
  - validates schema shape or a concrete environment payload
- `scripts/sync-render-env.js`
  - validates an environment payload and pushes it to Render through the Render API
- `.github/workflows/validate-env-schema.yml`
  - validates the schema on push and pull request
- `.github/workflows/render-env-sync.yml`
  - manual workflow for staging or production env sync using GitHub Environment secrets and vars

## Local usage

Validate the schema only:

```bash
npm run env:schema
```

Validate real values from your shell:

```bash
DATABASE_URL=postgres://... \
OPERATOR_BOOTSTRAP_EMAIL=admin@example.com \
OPERATOR_BOOTSTRAP_PASSWORD='super-secret-password' \
BUILDIUM_CLIENT_ID=... \
BUILDIUM_CLIENT_SECRET=... \
npm run env:validate -- --env staging
```

Validate values from a file:

```bash
npm run env:validate -- --env local --file .env --allow-missing-secrets
```

Dry-run a Render sync:

```bash
RENDER_API_KEY=... \
RENDER_SERVICE_ID=... \
DATABASE_URL=postgres://... \
OPERATOR_BOOTSTRAP_EMAIL=admin@example.com \
OPERATOR_BOOTSTRAP_PASSWORD='super-secret-password' \
BUILDIUM_CLIENT_ID=... \
BUILDIUM_CLIENT_SECRET=... \
npm run env:sync:render -- --env staging --dry-run
```

Apply a Render sync:

```bash
RENDER_API_KEY=... \
RENDER_SERVICE_ID=... \
DATABASE_URL=postgres://... \
OPERATOR_BOOTSTRAP_EMAIL=admin@example.com \
OPERATOR_BOOTSTRAP_PASSWORD='super-secret-password' \
BUILDIUM_CLIENT_ID=... \
BUILDIUM_CLIENT_SECRET=... \
npm run env:sync:render -- --env staging
```

## GitHub Actions model

The `render-env-sync.yml` workflow expects GitHub Environments named `staging` and `production`.

### GitHub Environment secrets

Set these as secrets in each GitHub Environment:

- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`
- `DATABASE_URL`
- `OPERATOR_BOOTSTRAP_EMAIL`
- `OPERATOR_BOOTSTRAP_PASSWORD`
- `RENTCAST_API_KEY` when used
- `CENSUS_API_KEY` when used
- `BUILDIUM_CLIENT_ID`
- `BUILDIUM_CLIENT_SECRET`

### GitHub Environment vars

Set these as GitHub Environment vars when you want to override schema defaults:

- `PORT`
- `HOST`
- `PGSSL`
- `SESSION_TTL_DAYS`
- `MFA_ISSUER`
- `MFA_CHALLENGE_TTL_MINUTES`
- `OPERATOR_BOOTSTRAP_NAME`
- `EXTERNAL_REAL_ESTATE_PROVIDER`
- `BUILDIUM_BASE_URL`
- `MARKET_ZIP`
- `MARKET_STATE_FIPS`
- `MARKET_PLACE`
- `DEMO_RADIUS_MILES`

If an environment var is omitted, the schema default is used.

## Operational pattern

1. Update `env.schema.json` when the application gains a new variable.
2. Add or rotate the corresponding GitHub Environment secret or var.
3. Run the `Sync Render Environment` workflow in dry-run mode first.
4. Run it again with `dry_run = false`.
5. Deploy the service after the sync completes.

This gives you a repeatable path for additional projects: copy the schema and scripts, then swap the variable catalog and target platform settings.
