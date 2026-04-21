#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "" ]]; then
  echo "Usage: $0 <json_dir>" >&2
  exit 1
fi

JSON_DIR="$1"

if [[ ! -d "$JSON_DIR" ]]; then
  echo "Error: JSON directory not found: $JSON_DIR" >&2
  exit 1
fi

shopt -s nullglob
FOUND=0
for json_file in "$JSON_DIR"/*.json; do
  [[ -f "$json_file" ]] || continue
  FOUND=1
  jq empty "$json_file"
  printf 'Valid JSON: %s\n' "$json_file"
done

if [[ "$FOUND" -eq 0 ]]; then
  echo "Error: no .json files found in $JSON_DIR" >&2
  exit 1
fi
