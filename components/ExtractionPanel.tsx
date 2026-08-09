"use client";

import type { Extraction, MailAction } from "@/lib/types";
import { routeExtraction } from "@/lib/types";

const ACTION_LABEL: Record<MailAction, string> = {
  deposit: "Deposit check",
  scan_and_notify: "Scan & notify",
  forward: "Forward",
  shred: "Shred",
};

const DOC_LABEL: Record<string, string> = {
  check: "Check",
  government_notice: "Government notice",
  legal_service: "Legal service of process",
  invoice: "Invoice",
  bank_statement: "Bank statement",
  utility_bill: "Utility bill",
  marketing: "Marketing mail",
  other: "Other",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.9 ? "bg-primary" : value >= 0.75 ? "bg-amber-400" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-dark/10">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-secondary">{pct}%</span>
    </div>
  );
}

function Row({ label, children, confidence }: { label: string; children: React.ReactNode; confidence?: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dark/5 py-2.5 last:border-0">
      <span className="text-xs font-medium uppercase tracking-wide text-secondary">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{children}</span>
        {confidence !== undefined && <ConfidenceBar value={confidence} />}
      </div>
    </div>
  );
}

export default function ExtractionPanel({
  extraction,
  meta,
}: {
  extraction: Extraction;
  meta?: { model: string; latencyMs: number; costUsd: number };
}) {
  const route = routeExtraction(extraction);
  const urgency = extraction.urgency.value ?? "low";

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg bg-primary/5 px-3 py-2.5 text-sm leading-relaxed">{extraction.summary}</p>

      <div className="rounded-lg border border-dark/10 bg-white px-4 py-1">
        <Row label="Type" confidence={extraction.docType.confidence}>
          {DOC_LABEL[extraction.docType.value ?? "other"]}
        </Row>
        <Row label="From" confidence={extraction.sender.confidence}>
          {extraction.sender.value ?? "—"}
        </Row>
        <Row label="To" confidence={extraction.recipient.confidence}>
          {extraction.recipient.value ?? "—"}
        </Row>
        {extraction.amount.value !== null && (
          <Row label="Amount" confidence={extraction.amount.confidence}>
            ${extraction.amount.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </Row>
        )}
        {extraction.keyDate.value !== null && (
          <Row label="Deadline" confidence={extraction.keyDate.confidence}>
            {extraction.keyDate.value}
          </Row>
        )}
        <Row label="Urgency" confidence={extraction.urgency.confidence}>
          <span
            className={
              urgency === "high"
                ? "text-danger font-semibold"
                : urgency === "medium"
                  ? "text-amber-600 font-semibold"
                  : "text-secondary"
            }
          >
            {urgency}
          </span>
        </Row>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-white">
          {ACTION_LABEL[extraction.recommendedAction]}
        </span>
        <span
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            route.route === "auto" ? "bg-success/40 text-dark" : "bg-amber-100 text-amber-900"
          }`}
        >
          {route.route === "auto" ? "Auto-routed" : "Human review"}
        </span>
      </div>
      <p className="text-xs text-secondary">{route.reason}</p>

      {meta && (
        <p className="text-xs text-secondary">
          {meta.model} · {(meta.latencyMs / 1000).toFixed(1)}s · ${meta.costUsd.toFixed(4)}/doc
        </p>
      )}
    </div>
  );
}
