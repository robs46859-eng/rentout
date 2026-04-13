#!/usr/bin/env node
import process from "process";
import { loadEnvSource, loadSchema, maskValue, parseArgs, resolveVariables, validateSchema } from "./env-lib.js";

const args = parseArgs(process.argv.slice(2));
const schema = loadSchema();
const schemaErrors = validateSchema(schema);

if (schemaErrors.length) {
  for (const error of schemaErrors) {
    console.error(`schema error: ${error}`);
  }
  process.exit(1);
}

if (args["schema-only"]) {
  console.log(`env schema valid for project ${schema.project}`);
  process.exit(0);
}

const targetEnv = String(args.env || "").trim();
if (!targetEnv || !schema.environments[targetEnv]) {
  console.error(`Unknown or missing --env. Expected one of: ${Object.keys(schema.environments).join(", ")}`);
  process.exit(1);
}

const source = loadEnvSource(args);
const { resolved, errors, warnings } = resolveVariables(schema, targetEnv, source, {
  allowMissingSecrets: Boolean(args["allow-missing-secrets"]),
});

for (const warning of warnings) {
  console.warn(`warning: ${warning}`);
}

if (errors.length) {
  for (const error of errors) {
    console.error(`error: ${error}`);
  }
  process.exit(1);
}

console.log(`validated ${resolved.length} variables for ${schema.project}/${targetEnv}`);
for (const variable of resolved.filter((item) => item.required || item.value)) {
  console.log(`- ${variable.name}=${maskValue(variable.name, variable.value, variable.kind)}${variable.required ? " [required]" : ""}`);
}
