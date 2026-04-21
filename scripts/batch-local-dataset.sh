#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "" || "${2:-}" == "" || "${3:-}" == "" || "${4:-}" == "" ]]; then
  echo "Usage: $0 <model> <prompt_file> <source_dir> <output_dir>" >&2
  exit 1
fi

MODEL="$1"
PROMPT_FILE="$2"
SOURCE_DIR="$3"
OUTPUT_DIR="$4"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Error: source directory not found: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

shopt -s nullglob
FOUND=0
for source_file in "$SOURCE_DIR"/*; do
  [[ -f "$source_file" ]] || continue
  FOUND=1
  base_name="$(basename "$source_file")"
  stem="${base_name%.*}"
  output_file="$OUTPUT_DIR/$stem.json"
  bash "$(dirname "$0")/run-local-dataset.sh" "$MODEL" "$PROMPT_FILE" "$source_file" "$output_file"
done

if [[ "$FOUND" -eq 0 ]]; then
  echo "Error: no source files found in $SOURCE_DIR" >&2
  exit 1
fi
