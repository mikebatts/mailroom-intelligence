export type DocType =
  | "check"
  | "government_notice"
  | "legal_service"
  | "invoice"
  | "bank_statement"
  | "utility_bill"
  | "marketing"
  | "other";

export type MailAction = "deposit" | "scan_and_notify" | "forward" | "shred";

export interface FieldValue<T> {
  value: T | null;
  confidence: number; // 0-1
}

export interface Extraction {
  docType: FieldValue<DocType>;
  sender: FieldValue<string>;
  recipient: FieldValue<string>;
  amount: FieldValue<number>; // dollars, null when not applicable
  keyDate: FieldValue<string>; // ISO date of deadline/due date, null when none
  urgency: FieldValue<"low" | "medium" | "high">;
  summary: string;
  recommendedAction: MailAction;
  overallConfidence: number;
}

export interface ExtractionRecord {
  sampleId: string;
  model: string;
  extraction: Extraction;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface MailSample {
  id: string;
  file: string; // public path to png
  label: string; // short human label for the gallery
}

// Routing policy: the product decision, kept in one place.
// High-stakes mail (legal service, government notices) always goes to a human
// regardless of confidence. Everything else auto-routes above the threshold.
// Started at 0.85; raised to 0.90 after the eval caught a wrong action
// auto-routed at 0.88 confidence (see README "What the eval changed").
export const CONFIDENCE_THRESHOLD = 0.9;

export function routeExtraction(e: Extraction): {
  route: "auto" | "review";
  reason: string;
} {
  if (e.docType.value === "legal_service" || e.docType.value === "government_notice") {
    return { route: "review", reason: "High-stakes document class always gets human eyes" };
  }
  if (e.overallConfidence >= CONFIDENCE_THRESHOLD) {
    return { route: "auto", reason: `Confidence ${(e.overallConfidence * 100).toFixed(0)}% meets the ${CONFIDENCE_THRESHOLD * 100}% bar` };
  }
  return { route: "review", reason: `Confidence ${(e.overallConfidence * 100).toFixed(0)}% below the ${CONFIDENCE_THRESHOLD * 100}% bar` };
}
