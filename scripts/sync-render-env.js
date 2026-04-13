#!/usr/bin/env node
import process from "process";
import {
  loadEnvSource,
  loadSchema,
  maskValue,
  parseArgs,
  resolveVariables,
  validateSchema,
} from "./env-lib.js";

async function renderRequest(apiKey, pathname, options = {}) {
  const response = await fetch(`https://api.render.com/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Render API ${response.status}: ${body || response.statusText}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

const args = parseArgs(process.argv.slice(2));
const targetEnv = String(args.env || "").trim();
const schema = loadSchema();
const schemaErrors = validateSchema(schema);
if (schemaErrors.length) {
  for (const error of schemaErrors) console.error(`schema error: ${error}`);
  process.exit(1);
}

if (!targetEnv || !schema.environments[targetEnv]) {
  console.error(`Unknown or missing --env. Expected one of: ${Object.keys(schema.environments).join(", ")}`);
  process.exit(1);
}

const apiKey = String(process.env.RENDER_API_KEY || "").trim();
const serviceId = String(process.env.RENDER_SERVICE_ID || args["service-id"] || "").trim();
if (!apiKey) {
  console.error("RENDER_API_KEY is required");
  process.exit(1);
}
if (!serviceId) {
  console.error("RENDER_SERVICE_ID or --service-id is required");
  process.exit(1);
}

const source = loadEnvSource(args);
const { resolved, errors, warnings } = resolveVariables(schema, targetEnv, source);
for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}

const desired = resolved.filter((item) => item.renderSync && (item.required || item.value !== ""));
const dryRun = Boolean(args["dry-run"]);
console.log(`${dryRun ? "planning" : "syncing"} ${desired.length} Render environment variables for ${schema.project}/${targetEnv}`);

const current = await renderRequest(apiKey, `/services/${serviceId}/env-vars`);
const currentByKey = new Map((current || []).map((item) => [item.key, item]));

for (const variable of desired) {
  const existing = currentByKey.get(variable.name);
  const display = maskValue(variable.name, variable.value, variable.kind);
  const action = existing ? "update" : "create";
  console.log(`- ${action} ${variable.name}=${display}`);
  if (dryRun) continue;
  await renderRequest(apiKey, `/services/${serviceId}/env-vars/${encodeURIComponent(variable.name)}`, {
    method: "PUT",
    body: JSON.stringify({
      value: variable.value,
    }),
  });
}

console.log(dryRun ? "dry run complete" : "Render env sync complete");
