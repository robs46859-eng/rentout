import fs from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const PLACEHOLDER_PATTERNS = [/changeme/i, /replace/i, /^todo$/i, /^example$/i, /^your-/i, /^xxx/i];

export function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function loadSchema() {
  const schemaPath = path.join(repoRoot(), "env.schema.json");
  return JSON.parse(fs.readFileSync(schemaPath, "utf8"));
}

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

export function parseDotEnv(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function loadEnvSource(args) {
  if (args.file) {
    return parseDotEnv(fs.readFileSync(path.resolve(args.file), "utf8"));
  }
  return { ...process.env };
}

export function envNamesForEnvironment(schema, targetEnv) {
  return Object.entries(schema.variables)
    .filter(([, definition]) => (definition.requiredIn || []).includes(targetEnv) || definition.defaults?.[targetEnv] != null)
    .map(([name]) => name);
}

export function resolveVariables(schema, targetEnv, sourceValues, options = {}) {
  const resolved = [];
  const errors = [];
  const warnings = [];
  const allowMissingSecrets = Boolean(options.allowMissingSecrets);

  for (const [name, definition] of Object.entries(schema.variables)) {
    const required = (definition.requiredIn || []).includes(targetEnv);
    const explicit = sourceValues[name];
    const fallback = definition.defaults?.[targetEnv];
    const value = explicit != null && explicit !== "" ? String(explicit) : fallback != null ? String(fallback) : "";
    const missing = value === "";
    const isSecret = definition.kind === "secret";

    if (required && missing && !(allowMissingSecrets && isSecret)) {
      errors.push(`${name} is required for ${targetEnv}`);
    }
    if (!missing && definition.minLength && value.length < definition.minLength) {
      errors.push(`${name} must be at least ${definition.minLength} characters`);
    }
    if (!missing && Array.isArray(definition.allowedValues) && !definition.allowedValues.includes(value)) {
      errors.push(`${name} must be one of: ${definition.allowedValues.join(", ")}`);
    }
    if (!missing && PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) {
      warnings.push(`${name} appears to still use a placeholder value`);
    }

    resolved.push({
      name,
      value,
      required,
      missing,
      renderSync: definition.renderSync !== false,
      kind: definition.kind,
      description: definition.description || "",
    });
  }

  return { resolved, errors, warnings };
}

export function validateSchema(schema) {
  const errors = [];
  if (!schema.project) errors.push("schema.project is required");
  if (!schema.environments || typeof schema.environments !== "object") errors.push("schema.environments is required");
  if (!schema.variables || typeof schema.variables !== "object") errors.push("schema.variables is required");

  for (const [name, definition] of Object.entries(schema.variables || {})) {
    if (!["config", "secret"].includes(definition.kind)) {
      errors.push(`${name}: kind must be config or secret`);
    }
    for (const envName of definition.requiredIn || []) {
      if (!schema.environments?.[envName]) {
        errors.push(`${name}: requiredIn references unknown environment ${envName}`);
      }
    }
    for (const envName of Object.keys(definition.defaults || {})) {
      if (!schema.environments?.[envName]) {
        errors.push(`${name}: defaults references unknown environment ${envName}`);
      }
    }
  }
  return errors;
}

export function maskValue(name, value, kind) {
  if (kind === "secret" && value) {
    return `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
  return value || "";
}
