// Runs extraction on every sample with every model and caches the results.
// The deployed demo serves these cached results so it costs nothing to browse;
// the live-upload path calls the same extractFromImage() at request time.
// Run: npm run precompute
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { extractFromImage } from "../lib/extract.ts";
import type { ExtractionRecord } from "../lib/types.ts";

const MODELS = ["claude-haiku-4-5", "claude-sonnet-4-6"];
// $/MTok input, output — used for the cost column in the eval table.
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1.0, 5.0],
  "claude-sonnet-4-6": [3.0, 15.0],
};

const samplesDir = new URL("../public/samples/", import.meta.url).pathname;
const outPath = new URL("../data/extractions.json", import.meta.url).pathname;

const ids = readdirSync(samplesDir).filter((f) => f.endsWith(".png")).map((f) => f.replace(".png", ""));
const records: ExtractionRecord[] = [];

for (const model of MODELS) {
  for (const id of ids) {
    const b64 = readFileSync(`${samplesDir}${id}.png`).toString("base64");
    process.stdout.write(`${model} ${id} ... `);
    try {
      const r = await extractFromImage(b64, "image/png", model);
      const [inP, outP] = PRICES[model];
      records.push({
        sampleId: id,
        model,
        extraction: r.extraction,
        latencyMs: r.latencyMs,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        costUsd: (r.inputTokens * inP + r.outputTokens * outP) / 1_000_000,
      });
      console.log(`ok ${r.latencyMs}ms conf=${r.extraction.overallConfidence}`);
    } catch (err) {
      console.log("FAILED:", (err as Error).message.slice(0, 120));
    }
  }
}

writeFileSync(outPath, JSON.stringify(records, null, 1));
console.log(`\nwrote ${records.length} records -> data/extractions.json`);
