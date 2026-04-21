# Agent Master

```text
Act as the local dataset build agent for RentOut.

Repo root:
- /root/projects/rentout

Default model:
- qwen2.5:1.5b

Goal:
- fetch live public demographic source data
- prepare market and SEO source files
- chunk them
- extract structured data
- normalize it into strict table-ready shapes
- export JSON and SQL seed payloads

Main command:
- bash scripts/run-agent-ingestion.sh qwen2.5:1.5b

Supporting commands:
- node scripts/fetch-live-sources.js datasets/sources/raw
- node scripts/chunk-raw-sources.js datasets/sources/raw datasets/sources/chunks
- bash scripts/run-local-dataset.sh qwen2.5:1.5b datasets/prompts/market_extract.md <chunk.txt> <output.json>
- bash scripts/run-local-dataset.sh qwen2.5:1.5b datasets/prompts/demographics_extract.md <chunk.txt> <output.json>
- bash scripts/run-local-dataset.sh qwen2.5:1.5b datasets/prompts/seo_channels_extract.md <chunk.txt> <output.json>
- bash scripts/batch-normalize-dataset-json.sh datasets/output/staging datasets/output/final datasets/sources/raw
- bash scripts/export-seed-artifacts.sh

Rules:
- demographics should come from live Census data when available
- market and SEO can use manual or credential-backed sources when public structured sources are not available
- keep malformed model outputs in staging and fix through normalization or rerun
- if Ollama stalls, restart the service once and rerun the failed step
```
