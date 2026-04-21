# RentOut Dataset Pack

Small-model dataset pack for `RentOut`.

## Purpose

Build source-grounded operating-market datasets for:

- market snapshots
- demographic snapshots
- SEO channel scorecards

This pack aligns with the current service layer and database tables in the app:

- `market_snapshots`
- `demographic_snapshots`
- `seo_channels`

## Recommended Inputs

- Census ACS tables and place pages
- RentCast responses or exported market reports
- internal SEO worksheets or listing channel audits
- broker or PMS market notes only when clearly sourced

## Low-Cost Model Guidance

- Use one prompt per table type.
- Provide raw API responses or copied page text.
- Never ask the model to estimate rents, occupancy, or vacancy when the source does not provide them.
- Use the model to normalize field names, not to forecast.

## Main Files

- `prompts/market_extract.md`
- `prompts/demographics_extract.md`
- `prompts/seo_channels_extract.md`
- `schemas/market_snapshot.schema.json`
- `schemas/demographic_snapshot.schema.json`
- `schemas/seo_channel.schema.json`

## Runner

Use the local runner script from the repo root:

```bash
bash scripts/run-local-dataset.sh gemma4:e2b datasets/prompts/market_extract.md datasets/sources/chunks/example-market-source.txt datasets/output/staging/example-market.json
```

Batch-run every chunk file in a directory:

```bash
bash scripts/batch-local-dataset.sh gemma4:e2b datasets/prompts/market_extract.md datasets/sources/chunks datasets/output/staging
```

Validate generated JSON files:

```bash
bash scripts/validate-dataset-json.sh datasets/output/staging
```

Normalize staging outputs into app-shaped final outputs:

```bash
bash scripts/batch-normalize-dataset-json.sh datasets/output/staging datasets/output/final
bash scripts/validate-dataset-json.sh datasets/output/final
```

Export final outputs into seed-ready artifacts:

```bash
bash scripts/export-seed-artifacts.sh
```

End-to-end ingestion:

```bash
bash scripts/run-agent-ingestion.sh qwen2.5:1.5b
```
