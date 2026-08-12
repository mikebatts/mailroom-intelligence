// Re-runs extraction on a set of queued docs, injecting human corrections as
// few-shot exemplars. Falls back to the precomputed canned scenario when no
// API key is available, so the demo works for keyless viewers.
import { NextRequest, NextResponse } from "next/server";
import { extractFromImage } from "@/lib/extract";
import type { CorrectionExemplar } from "@/lib/extract";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const maxDuration = 60;

export interface ReextractRequest {
  // sampleIds to re-run (the other queued items, not the corrected one)
  sampleIds: string[];
  // the corrections the reviewer made
  exemplars: CorrectionExemplar[];
  // set true to force the canned demo path even if a key is present
  useDemo?: boolean;
}

export interface ReextractResult {
  sampleId: string;
  before: { overallConfidence: number; recommendedAction: string };
  after: {
    extraction: object;
    overallConfidence: number;
    recommendedAction: string;
    latencyMs: number;
  };
  fromCache: boolean;
}

export async function POST(req: NextRequest) {
  const body: ReextractRequest = await req.json();
  const { sampleIds, exemplars, useDemo } = body;

  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY);

  // Use demo cache when: no key, or caller explicitly requests it.
  if (!hasKey || useDemo) {
    return serveDemoCache(sampleIds);
  }

  // Live path: read sample images from the public directory and re-run.
  const results: ReextractResult[] = [];
  const samplesPath = join(process.cwd(), "public", "samples");
  const extractionsRaw = readFileSync(join(process.cwd(), "data", "extractions.json"), "utf8");
  const extractions: Array<{ sampleId: string; model: string; extraction: { overallConfidence: number; recommendedAction: string } }> =
    JSON.parse(extractionsRaw);
  const MODEL = "claude-haiku-4-5";

  for (const sampleId of sampleIds) {
    const prior = extractions.find((e) => e.sampleId === sampleId && e.model === MODEL);
    if (!prior) continue;
    try {
      const imgBuffer = readFileSync(join(samplesPath, `${sampleId}.png`));
      const b64 = imgBuffer.toString("base64");
      const result = await extractFromImage(b64, "image/png", MODEL, exemplars);
      results.push({
        sampleId,
        before: {
          overallConfidence: prior.extraction.overallConfidence,
          recommendedAction: prior.extraction.recommendedAction,
        },
        after: {
          extraction: result.extraction,
          overallConfidence: result.extraction.overallConfidence,
          recommendedAction: result.extraction.recommendedAction,
          latencyMs: result.latencyMs,
        },
        fromCache: false,
      });
    } catch {
      // fall through — skip failed doc
    }
  }

  return NextResponse.json({ results });
}

function serveDemoCache(requestedIds: string[]) {
  try {
    const cachePath = join(process.cwd(), "data", "correction-demo.json");
    const cache: { results: ReextractResult[] } = JSON.parse(readFileSync(cachePath, "utf8"));
    // Filter to only the requested ids when caller passes a subset.
    const filtered = requestedIds.length
      ? cache.results.filter((r) => requestedIds.includes(r.sampleId))
      : cache.results;
    return NextResponse.json({ results: filtered, fromCache: true });
  } catch {
    return NextResponse.json(
      { error: "Demo cache not found. Run: npm run precompute:correction" },
      { status: 503 }
    );
  }
}
