import fs from "node:fs";
import path from "node:path";

const [, , inputDirArg, outputDirArg, chunkSizeArg] = process.argv;

if (!inputDirArg || !outputDirArg) {
  console.error("Usage: node scripts/chunk-raw-sources.js <input_dir> <output_dir> [chunk_words]");
  process.exit(1);
}

const inputDir = path.resolve(inputDirArg);
const outputDir = path.resolve(outputDirArg);
const chunkWords = Number(chunkSizeArg || 1800);

fs.mkdirSync(outputDir, { recursive: true });

for (const file of fs.readdirSync(inputDir).filter((name) => name.endsWith(".txt")).sort()) {
  const fullPath = path.join(inputDir, file);
  const text = fs.readFileSync(fullPath, "utf8");
  const [header, body] = splitHeaderBody(text);
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length === 0) continue;

  let chunkIndex = 1;
  for (let i = 0; i < words.length; i += chunkWords) {
    const chunkBody = words.slice(i, i + chunkWords).join(" ");
    const outPath = path.join(outputDir, `${file.replace(/-source\.txt$/, "")}-chunk-${String(chunkIndex).padStart(3, "0")}.txt`);
    fs.writeFileSync(outPath, `${header}\n\n${chunkBody}\n`);
    console.log(`Wrote ${outPath}`);
    chunkIndex += 1;
  }
}

function splitHeaderBody(text) {
  const idx = text.indexOf("\n\n");
  if (idx === -1) return ["", text];
  return [text.slice(0, idx).trim(), text.slice(idx + 2).trim()];
}
