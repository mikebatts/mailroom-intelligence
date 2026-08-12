import type { Extraction } from "./types";

// Provider-flexible vision extraction.
// Prefers ANTHROPIC_API_KEY (direct API); falls back to OPENROUTER_API_KEY
// (OpenAI-compatible). Same prompt, same schema, same parsing either way, so
// the eval harness can compare models without touching this code.

const EXTRACTION_PROMPT = `You are the document-understanding step of a mailroom automation pipeline. You are looking at one piece of physical mail scanned at intake.

Extract the following and respond with ONLY a JSON object, no markdown fences:

{
  "docType": {"value": "check|government_notice|legal_service|invoice|bank_statement|utility_bill|marketing|other", "confidence": 0.0-1.0},
  "sender": {"value": "who sent it", "confidence": 0.0-1.0},
  "recipient": {"value": "who it is addressed to", "confidence": 0.0-1.0},
  "amount": {"value": number in dollars or null if no primary amount, "confidence": 0.0-1.0},
  "keyDate": {"value": "YYYY-MM-DD deadline or due date, null if none", "confidence": 0.0-1.0},
  "urgency": {"value": "low|medium|high", "confidence": 0.0-1.0},
  "summary": "one plain sentence a busy founder would want",
  "recommendedAction": "deposit|scan_and_notify|forward|shred"
}

Guidance:
- checks: amount is the check amount, action is deposit.
- legal service of process or government notices with deadlines: urgency high, action scan_and_notify.
- marketing mail: urgency low, action shred.
- Confidence reflects how legible/unambiguous the field actually is. Do not inflate. If handwriting is hard to read, say so with a lower number.
- amount confidence is 1.0 only when digits AND written words agree.`;

export interface RawResult {
  extraction: Extraction;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

function computeOverall(e: Omit<Extraction, "overallConfidence">): number {
  const parts = [e.docType, e.sender, e.recipient, e.urgency]
    .map((f) => f.confidence)
    .concat(e.amount.value !== null ? [e.amount.confidence] : [])
    .concat(e.keyDate.value !== null ? [e.keyDate.confidence] : []);
  const min = Math.min(...parts);
  const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
  // Weight toward the weakest field: one illegible field should sink the score.
  return Math.round((0.6 * min + 0.4 * avg) * 100) / 100;
}

export function parseExtraction(text: string): Extraction {
  const cleaned = text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const obj = JSON.parse(cleaned.slice(start, end + 1));
  const e = obj as Omit<Extraction, "overallConfidence">;
  return { ...e, overallConfidence: computeOverall(e) };
}

export interface CorrectionExemplar {
  sampleLabel: string;
  field: string;
  before: string;
  after: string;
}

function buildFewShotBlock(exemplars: CorrectionExemplar[]): string {
  if (!exemplars.length) return "";
  const lines = exemplars.map(
    (ex) => `  • ${ex.sampleLabel} — field "${ex.field}": model read "${ex.before}", reviewer corrected to "${ex.after}"`
  );
  return `\n\nA human reviewer corrected the following extraction errors on earlier documents in this batch. Learn from these corrections when interpreting ambiguous or low-confidence fields:\n${lines.join("\n")}`;
}

export async function extractFromImage(
  imageBase64: string,
  mediaType: string,
  model: string,
  exemplars: CorrectionExemplar[] = []
): Promise<RawResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const started = Date.now();

  const fewShotBlock = buildFewShotBlock(exemplars);
  const promptWithExemplars = EXTRACTION_PROMPT + fewShotBlock;

  if (anthropicKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              { type: "text", text: promptWithExemplars },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      extraction: parseExtraction(data.content[0].text),
      latencyMs: Date.now() - started,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
    };
  }

  if (openrouterKey) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: `anthropic/${model}`,
        max_tokens: 800,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
              { type: "text", text: promptWithExemplars },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenRouter API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      extraction: parseExtraction(data.choices[0].message.content),
      latencyMs: Date.now() - started,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };
  }

  throw new Error("No API key configured. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY.");
}
