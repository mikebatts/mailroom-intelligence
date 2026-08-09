// Scores cached extractions against data/groundtruth.json and writes:
//   data/eval.json     — per-model metrics the UI renders
//   (stdout)           — markdown table for the README
// Run: npm run eval
import { readFileSync, writeFileSync } from "node:fs";
import type { ExtractionRecord } from "../lib/types.ts";
import { routeExtraction } from "../lib/types.ts";

const records: ExtractionRecord[] = JSON.parse(
  readFileSync(new URL("../data/extractions.json", import.meta.url), "utf8")
);
const truth = JSON.parse(
  readFileSync(new URL("../data/groundtruth.json", import.meta.url), "utf8")
);

const norm = (s: string | null) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\b(llc|inc|co|corp)\b/g, "").trim();

// Loose-but-honest matchers per field.
const senderMatch = (got: string | null, want: string | null) => {
  if (!want) return got === null || got === "";
  const g = norm(got), w = norm(want);
  return g.includes(w) || w.includes(g) || w.split(" ").filter((t) => t.length > 3 && g.includes(t)).length >= 2;
};
const amountMatch = (got: number | null, want: number | null) =>
  want === null ? got === null : got !== null && Math.abs(got - want) < 0.01;
const dateMatch = (got: string | null, want: string | null) =>
  want === null ? true : got === want; // null-truth dates unscored (e.g. offer expiries on junk)

interface ModelStats {
  model: string;
  n: number;
  docType: number; sender: number; recipient: number; amount: number; keyDate: number; action: number;
  routingSafe: number; // no wrong auto-routed item (per item: routed auto AND any core field wrong = unsafe)
  autoRate: number;
  meanLatencyMs: number;
  totalCostUsd: number;
  costPerDocUsd: number;
}

const models = [...new Set(records.map((r) => r.model))];
const stats: ModelStats[] = [];

for (const model of models) {
  const rs = records.filter((r) => r.model === model);
  const s = { model, n: rs.length, docType: 0, sender: 0, recipient: 0, amount: 0, keyDate: 0, action: 0, routingSafe: 0, autoRate: 0, meanLatencyMs: 0, totalCostUsd: 0, costPerDocUsd: 0 };
  let dateScored = 0;
  for (const r of rs) {
    const t = truth[r.sampleId];
    if (!t) continue;
    const e = r.extraction;
    const okDoc = e.docType.value === t.docType;
    const okSender = senderMatch(e.sender.value, t.sender);
    const okAmount = amountMatch(e.amount.value, t.amount);
    const okDate = dateMatch(e.keyDate.value, t.keyDate);
    const okAction = e.recommendedAction === t.recommendedAction;
    const okRecipient = senderMatch(e.recipient.value, t.recipient);
    s.docType += +okDoc; s.sender += +okSender; s.recipient += +okRecipient;
    s.amount += +okAmount; s.action += +okAction;
    if (t.keyDate !== null) { dateScored++; s.keyDate += +okDate; }
    const route = routeExtraction(e).route;
    if (route === "auto") s.autoRate++;
    // Safety: an item is unsafe when auto-routed with a wrong doc type, amount, or action.
    const unsafe = route === "auto" && (!okDoc || !okAmount || !okAction);
    s.routingSafe += unsafe ? 0 : 1;
    s.meanLatencyMs += r.latencyMs;
    s.totalCostUsd += r.costUsd;
  }
  const n = rs.length || 1;
  stats.push({
    ...s,
    docType: s.docType / n, sender: s.sender / n, recipient: s.recipient / n,
    amount: s.amount / n, keyDate: dateScored ? s.keyDate / dateScored : 1,
    action: s.action / n, routingSafe: s.routingSafe / n, autoRate: s.autoRate / n,
    meanLatencyMs: Math.round(s.meanLatencyMs / n),
    costPerDocUsd: s.totalCostUsd / n,
  });
}

writeFileSync(new URL("../data/eval.json", import.meta.url), JSON.stringify(stats, null, 1));

const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log("\n| Model | Doc type | Sender | Amount | Deadline | Action | Safe routing | Auto rate | Latency | Cost/doc |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const s of stats) {
  console.log(`| ${s.model} | ${pct(s.docType)} | ${pct(s.sender)} | ${pct(s.amount)} | ${pct(s.keyDate)} | ${pct(s.action)} | ${pct(s.routingSafe)} | ${pct(s.autoRate)} | ${s.meanLatencyMs}ms | $${s.costPerDocUsd.toFixed(4)} |`);
}
console.log(`\nn=${stats[0]?.n ?? 0} labeled samples. Safe routing = item never auto-routed while a core field (type, amount, action) was wrong.`);
