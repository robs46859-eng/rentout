#!/usr/bin/env bash
set -euo pipefail

MODEL="${1:-qwen2.5:1.5b}"

mkdir -p datasets/sources/raw datasets/sources/chunks datasets/output/staging datasets/output/final

node scripts/fetch-live-sources.js datasets/sources/raw
node scripts/chunk-raw-sources.js datasets/sources/raw datasets/sources/chunks

shopt -s nullglob
for chunk_file in datasets/sources/chunks/market_snapshots-*-chunk-*.txt; do
  bash scripts/run-local-dataset.sh "$MODEL" datasets/prompts/market_extract.md "$chunk_file" "datasets/output/staging/$(basename "${chunk_file%.txt}.json")"
done

for chunk_file in datasets/sources/chunks/demographic_snapshots-*-chunk-*.txt; do
  bash scripts/run-local-dataset.sh "$MODEL" datasets/prompts/demographics_extract.md "$chunk_file" "datasets/output/staging/$(basename "${chunk_file%.txt}.json")"
done

for chunk_file in datasets/sources/chunks/seo_channels-*-chunk-*.txt; do
  bash scripts/run-local-dataset.sh "$MODEL" datasets/prompts/seo_channels_extract.md "$chunk_file" "datasets/output/staging/$(basename "${chunk_file%.txt}.json")"
done

bash scripts/validate-dataset-json.sh datasets/output/staging
bash scripts/batch-normalize-dataset-json.sh datasets/output/staging datasets/output/final datasets/sources/raw
bash scripts/validate-dataset-json.sh datasets/output/final
bash scripts/export-seed-artifacts.sh
