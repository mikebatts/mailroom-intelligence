"use client";

import type { Extraction, MailAction } from "@/lib/types";
import { routeExtraction } from "@/lib/types";

export type Phase = "idle" | "scan" | "extract" | "route" | "done";

const ACTION_LABEL: Record<MailAction, string> = {
  deposit: "Deposit",
  scan_and_notify: "Scan & notify",
  forward: "Forward",
  shred: "Shred",
};

const DOC_LABEL: Record<string, string> = {
  check: "Check",
  government_notice: "Gov notice",
  legal_service: "Legal service",
  invoice: "Invoice",
  bank_statement: "Statement",
  utility_bill: "Utility bill",
  marketing: "Marketing",
  other: "Other",
};

function Bar({ value, delay }: { value: number; delay: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.9 ? "bg-primary" : value >= 0.75 ? "bg-amber-400" : "bg-danger";
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1 w-12 overflow-hidden rounded-full bg-ink/10 sm:w-14">
        <span
          className={`bar-fill block h-full rounded-full ${tone}`}
          style={{ width: `${pct}%`, animationDelay: `${delay}ms` }}
        />
      </span>
      <span className="w-7 text-right font-mono text-[10px] text-secondary">{pct}</span>
    </span>
  );
}

function ReadoutRow({
  label,
  value,
  confidence,
  delay,
  tone,
}: {
  label: string;
  value: string;
  confidence?: number;
  delay: number;
  tone?: string;
}) {
  return (
    <div
      className="row-in flex items-baseline justify-between gap-3 border-b border-ink/5 py-2 last:border-0"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-secondary">{label}</span>
      <span className="flex min-w-0 items-baseline gap-2.5">
        <span className={`truncate text-right font-mono text-[13px] font-medium sm:text-sm ${tone ?? ""}`}>
          {value}
        </span>
        {confidence !== undefined && <Bar value={confidence} delay={delay + 150} />}
      </span>
    </div>
  );
}

export default function Stage({
  image,
  label,
  extraction,
  phase,
  meta,
  live,
}: {
  image: string | null;
  label: string;
  extraction: Extraction | null;
  phase: Phase;
  meta: { model: string; latencyMs: number; costUsd: number } | null;
  live?: boolean;
}) {
  const showReadout = phase === "extract" || phase === "route" || phase === "done";
  const showStamp = phase === "route" || phase === "done";
  const route = extraction ? routeExtraction(extraction) : null;
  const stepLabel =
    phase === "scan" ? "scanning" : phase === "extract" ? "extracting" : phase === "route" ? "routing" : "";

  const steps: { id: Phase; name: string }[] = [
    { id: "scan", name: "Scan" },
    { id: "extract", name: "Extract" },
    { id: "route", name: "Route" },
  ];
  const stepState = (id: Phase) => {
    const order: Phase[] = ["scan", "extract", "route", "done"];
    const cur = order.indexOf(phase);
    const mine = order.indexOf(id);
    if (phase === "idle") return "todo";
    if (mine < cur || phase === "done") return "done";
    if (mine === cur) return "active";
    return "todo";
  };

  return (
    <div className="grid gap-5 md:grid-cols-[1.15fr_1fr] md:gap-8">
      {/* the piece of mail */}
      <div className="relative">
        <div className="paper-card relative overflow-hidden rounded-2xl">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={label} className="max-h-[30vh] w-full object-contain sm:max-h-[420px]" />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-secondary">
              Pick a piece of mail below
            </div>
          )}
          {phase === "scan" && <div className="scan-beam" />}
          {showStamp && route && (
            <div
              className={`stamp-in absolute right-3 top-3 rounded-lg border-[3px] px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest sm:right-5 sm:top-5 sm:text-sm ${
                route.route === "auto"
                  ? "border-primary/80 bg-light/85 text-primary"
                  : "border-amber-500/80 bg-light/85 text-amber-600"
              }`}
            >
              {route.route === "auto" ? "auto-routed" : "human review"}
            </div>
          )}
        </div>
        <p className="mt-2.5 text-center font-mono text-[11px] uppercase tracking-widest text-secondary">
          {label}
          {live && " · live extraction"}
        </p>
      </div>

      {/* the machine readout */}
      <div className="flex flex-col justify-center">
        {/* step lights */}
        <div className="mb-4 flex items-center gap-2" aria-label="Pipeline progress">
          {steps.map((s, i) => {
            const st = stepState(s.id);
            return (
              <span key={s.id} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-5 bg-ink/15 sm:w-8" />}
                <span
                  className={`flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                    st === "active" ? "text-primary" : st === "done" ? "text-ink" : "text-ink/30"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full transition-colors ${
                      st === "active"
                        ? "animate-pulse bg-primary"
                        : st === "done"
                          ? "bg-primary/70"
                          : "bg-ink/15"
                    }`}
                  />
                  {s.name}
                </span>
              </span>
            );
          })}
        </div>

        {phase === "idle" && !extraction && (
          <p className="text-sm leading-relaxed text-secondary">
            Every piece of mail below runs through the same pipeline. Watch it work, or drop in your own.
          </p>
        )}

        {(phase === "scan" || (phase === "extract" && !extraction)) && (
          <p className="processing-caret font-mono text-sm text-secondary">{stepLabel}</p>
        )}

        {showReadout && extraction && (
          <div className="paper-card rounded-2xl px-4 py-1.5 sm:px-5">
            <ReadoutRow label="Type" value={DOC_LABEL[extraction.docType.value ?? "other"]} confidence={extraction.docType.confidence} delay={0} />
            <ReadoutRow label="From" value={extraction.sender.value ?? "—"} confidence={extraction.sender.confidence} delay={110} />
            <ReadoutRow label="To" value={extraction.recipient.value ?? "—"} confidence={extraction.recipient.confidence} delay={220} />
            {extraction.amount.value !== null && (
              <ReadoutRow
                label="Amount"
                value={`$${extraction.amount.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                confidence={extraction.amount.confidence}
                delay={330}
              />
            )}
            {extraction.keyDate.value !== null && (
              <ReadoutRow label="Due" value={extraction.keyDate.value} confidence={extraction.keyDate.confidence} delay={440} />
            )}
            <ReadoutRow
              label="Urgency"
              value={extraction.urgency.value ?? "low"}
              confidence={extraction.urgency.confidence}
              delay={550}
              tone={
                extraction.urgency.value === "high"
                  ? "text-danger"
                  : extraction.urgency.value === "medium"
                    ? "text-amber-600"
                    : "text-secondary"
              }
            />
          </div>
        )}

        {showStamp && extraction && route && (
          <div className="row-in mt-4 flex flex-wrap items-center gap-2" style={{ animationDelay: "60ms" }}>
            <span className="rounded-full bg-primary px-3.5 py-1.5 text-sm font-semibold text-white">
              → {ACTION_LABEL[extraction.recommendedAction]}
            </span>
            <span className="text-xs leading-snug text-secondary">{route.reason}</span>
          </div>
        )}

        {phase === "done" && extraction && (
          <p className="row-in mt-3 text-[13px] leading-relaxed text-secondary" style={{ animationDelay: "120ms" }}>
            {extraction.summary}
          </p>
        )}

        {phase === "done" && meta && (
          <p className="row-in mt-3 font-mono text-[11px] text-secondary/80" style={{ animationDelay: "200ms" }}>
            {meta.model} · {(meta.latencyMs / 1000).toFixed(1)}s · ${meta.costUsd.toFixed(4)}
          </p>
        )}
      </div>
    </div>
  );
}
