#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "" || "${2:-}" == "" ]]; then
  echo "Usage: $0 <input_dir> <output_dir> [source_dir]" >&2
  exit 1
fi

INPUT_DIR="$1"
OUTPUT_DIR="$2"
SOURCE_DIR="${3:-datasets/sources/chunks}"

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Error: input directory not found: $INPUT_DIR" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

shopt -s nullglob
FOUND=0
for input_file in "$INPUT_DIR"/*.json; do
  [[ -f "$input_file" ]] || continue
  FOUND=1
  stem="$(basename "$input_file" .json)"
  source_file="$SOURCE_DIR/$stem-source.txt"
  if [[ ! -f "$source_file" && "$stem" == *-chunk-* ]]; then
    source_file="$SOURCE_DIR/${stem%-chunk-*}-source.txt"
  fi
  output_file="$OUTPUT_DIR/$stem.json"
  if [[ -f "$source_file" ]]; then
    node scripts/normalize-dataset-json.js "$input_file" "$output_file" "$source_file"
  else
    node scripts/normalize-dataset-json.js "$input_file" "$output_file"
  fi
done

if [[ "$FOUND" -eq 0 ]]; then
  echo "Error: no .json files found in $INPUT_DIR" >&2
  exit 1
fi
