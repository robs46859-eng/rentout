#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "" || "${2:-}" == "" || "${3:-}" == "" || "${4:-}" == "" ]]; then
  echo "Usage: $0 <model> <prompt_file> <source_file> <output_file>" >&2
  exit 1
fi

MODEL="$1"
PROMPT_FILE="$2"
SOURCE_FILE="$3"
OUTPUT_FILE="$4"

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is not installed or not in PATH." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is not installed or not in PATH." >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: prompt file not found: $PROMPT_FILE" >&2
  exit 1
fi

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Error: source file not found: $SOURCE_FILE" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_FILE")"

TMP_INPUT="$(mktemp)"
TMP_RESPONSE="$(mktemp)"
trap 'rm -f "$TMP_INPUT" "$TMP_RESPONSE"' EXIT

strip_prompt_wrapper() {
  sed '/^```[[:alpha:]]*$/d;/^```$/d' "$1"
}

{
  printf 'Follow the prompt exactly. Return JSON only.\n'
  printf 'Do not use markdown fences.\n'
  printf 'Start directly with a JSON object or array.\n\n'
  printf 'PROMPT FILE: %s\n' "$PROMPT_FILE"
  printf 'SOURCE FILE: %s\n\n' "$SOURCE_FILE"
  printf '%s\n' '--- BEGIN PROMPT ---'
  strip_prompt_wrapper "$PROMPT_FILE"
  printf '\n%s\n' '--- END PROMPT ---'
  printf '\n%s\n' '--- BEGIN SOURCE ---'
  cat "$SOURCE_FILE"
  printf '\n%s\n' '--- END SOURCE ---'
} > "$TMP_INPUT"

REQUEST_BODY="$(jq -Rn --arg model "$MODEL" --rawfile prompt "$TMP_INPUT" '{model: $model, prompt: $prompt, stream: false}')"

curl -fsS --max-time "${OLLAMA_TIMEOUT_SECONDS:-120}" \
  http://127.0.0.1:11434/api/generate \
  -H 'Content-Type: application/json' \
  -d "$REQUEST_BODY" > "$TMP_RESPONSE"

RAW_OUTPUT_FILE="${OUTPUT_FILE%.json}.raw.txt"
cp "$TMP_RESPONSE" "$RAW_OUTPUT_FILE"

jq -r '.response' "$TMP_RESPONSE" \
  | perl -0pe 's/\r//g; s/\e\[[0-9;?]*[ -\/]*[@-~]//g; s/[^\n]\x08//g' \
  | perl -0pe 's/\s+\/\/[^\n]*$//mg' \
  | sed '/^```[[:alpha:]]*$/d;/^```$/d' \
  | perl -0ne 'if (/([\{\[].*[\}\]])/s) { print $1 }' > "$OUTPUT_FILE"

if [[ ! -s "$OUTPUT_FILE" ]]; then
  echo "Error: no output written to $OUTPUT_FILE" >&2
  exit 1
fi

jq empty "$OUTPUT_FILE" >/dev/null 2>&1 || {
  echo "Error: invalid JSON written to $OUTPUT_FILE" >&2
  echo "Raw model output saved to $RAW_OUTPUT_FILE" >&2
  exit 1
}

printf 'Wrote %s\n' "$OUTPUT_FILE"
