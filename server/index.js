import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { migrate } from "./db.js";
import { buildConsolidatedResponse } from "./services/consolidated.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

migrate();

const app = express();
const port = Number(process.env.PORT || 3847);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "rentout-api", time: new Date().toISOString() });
});

app.get("/api/v1/consolidated", async (_req, res) => {
  try {
    const payload = await buildConsolidatedResponse(process.env);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.use(express.static(publicDir));

app.listen(port, () => {
  console.log(`RentOut API http://127.0.0.1:${port}`);
});
