"use client";

import type { Extraction, MailAction } from "@/lib/types";
import { routeExtraction, CONFIDENCE_THRESHOLD } from "@/lib/types";

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

/* Postmark ornament — circular SVG */
function Postmark({ size = 52, className = "" }: { size?: number; className?: string }) {
  const r = size / 2;
  const outerR = r - 2;
  const innerR = r - 7;
  const today = new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase();
  const text = `MAILROOM INTELLIGENCE • NYC • ${today}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className={className}
      style={{ opacity: 0.55 }}
    >
      <circle cx={r} cy={r} r={outerR} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={r} cy={r} r={innerR} fill="none" stroke="currentColor" strokeWidth="1" />
      <path id={`arc-${size}`} d={`M ${r - innerR + 1},${r} a${innerR - 1},${innerR - 1} 0 0 1 ${(innerR - 1) * 2},0`} fill="none" />
      <text fontSize="5.5" fontFamily="var(--font-plex-mono, monospace)" fill="currentColor" letterSpacing="0.8">
        <textPath href={`#arc-${size}`} startOffset="50%" textAnchor="middle">
          {text}
        </textPath>
      </text>
      {/* center cross lines */}
      <line x1={r - 6} y1={r} x2={r + 6} y2={r} stroke="currentColor" strokeWidth="1" />
      <line x1={r} y1={r - 6} x2={r} y2={r + 6} stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function Bar({ value, delay }: { value: number; delay: number }) {
  const pct = Math.round(value * 100);
  const belowThreshold = value < CONFIDENCE_THRESHOLD;
  const tone = value >= CONFIDENCE_THRESHOLD
    ? "bg-stamp-green"
    : value >= 0.75
      ? "bg-amber-500"
      : "bg-postal-red";
  return (
    <span className="flex items-center gap-1.5">
      {/* threshold dashed rule at CONFIDENCE_THRESHOLD position */}
      <span className="relative h-1.5 w-14 overflow-visible rounded-full" style={{ background: "rgba(26,28,34,0.12)" }}>
        <span
          className={`bar-fill block h-full rounded-full ${tone}`}
          style={{ width: `${pct}%`, animationDelay: `${delay}ms` }}
        />
        {/* threshold marker at 90% */}
        {belowThreshold && (
          <span
            className="absolute top-1/2 -translate-y-1/2 w-px h-3 bg-postal-red/70"
            style={{ left: `${CONFIDENCE_THRESHOLD * 100}%`, opacity: 0.7 }}
            title={`auto-route bar ${Math.round(CONFIDENCE_THRESHOLD * 100)}%`}
          />
        )}
      </span>
      <span className="w-6 text-right font-mono text-[10px]" style={{ color: "var(--readout)" }}>{pct}</span>
    </span>
  );
}

function ReadoutRow({
  label,
  value,
  confidence,
  delay,
  hot,
}: {
  label: string;
  value: string;
  confidence?: number;
  delay: number;
  hot?: boolean;
}) {
  return (
    <div
      className="row-in flex items-baseline justify-between gap-3 py-2"
      style={{
        animationDelay: `${delay}ms`,
        borderBottom: "1px solid rgba(26,28,34,0.08)",
      }}
    >
      <span
        className="shrink-0 font-mono text-[9px] uppercase tracking-widest"
        style={{ color: "var(--readout)" }}
      >
        {label}
      </span>
      <span className="flex min-w-0 items-baseline gap-2.5">
        <span
          className="min-w-0 truncate text-right font-mono text-[12px] font-medium"
          style={{ color: hot ? "var(--postal-red)" : "var(--ink)" }}
        >
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
    { id: "scan", name: "scan" },
    { id: "extract", name: "extract" },
    { id: "route", name: "route" },
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
      {/* THE PIECE OF MAIL — angled on desk */}
      <div className="relative min-w-0">
        {/* Postmark corner ornament */}
        <Postmark
          size={56}
          className="absolute -top-4 -right-2 z-10 text-readout pointer-events-none hidden md:block"
        />
        <div
          className="paper-card hero-doc perforated-top relative overflow-hidden rounded-lg"
          style={{ paddingTop: 10 }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={label}
              className="max-h-[30vh] w-full object-contain sm:max-h-[420px]"
            />
          ) : (
            <div
              className="flex h-64 items-center justify-center font-mono text-[11px] uppercase tracking-widest"
              style={{ color: "var(--readout)" }}
            >
              pick a piece of mail below
            </div>
          )}
          {phase === "scan" && <div className="scan-beam" />}

          {/* ROUTE STAMP */}
          {showStamp && route && (
            <div
              className={`stamp stamp-in absolute right-3 top-5 sm:right-5 sm:top-6 ${
                route.route === "auto" ? "stamp-auto" : "stamp-review"
              }`}
            >
              {route.route === "auto" ? "auto-routed" : "human review"}
            </div>
          )}
        </div>
        <p
          className="mt-2 text-center font-mono text-[10px] uppercase tracking-widest"
          style={{ color: "var(--readout)" }}
        >
          {label}
          {live && " · live extraction"}
        </p>
      </div>

      {/* THE MACHINE READOUT */}
      <div className="flex min-w-0 flex-col justify-center">
        {/* step dots */}
        <div className="mb-4 flex items-center gap-2" aria-label="Pipeline progress">
          {steps.map((s, i) => {
            const st = stepState(s.id);
            return (
              <span key={s.id} className="flex items-center gap-2">
                {i > 0 && <span className="h-px w-4 sm:w-6" style={{ background: "rgba(154,163,178,0.2)" }} />}
                <span
                  className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors"
                  style={{
                    color: st === "active"
                      ? "var(--postal-blue)"
                      : st === "done"
                        ? "var(--readout-hot)"
                        : "rgba(154,163,178,0.35)",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full transition-colors"
                    style={{
                      background: st === "active"
                        ? "var(--postal-blue)"
                        : st === "done"
                          ? "var(--readout)"
                          : "rgba(154,163,178,0.2)",
                    }}
                  />
                  {s.name}
                </span>
              </span>
            );
          })}
        </div>

        {phase === "idle" && !extraction && (
          <p className="font-mono text-[12px] leading-relaxed" style={{ color: "var(--readout)" }}>
            every piece of mail below runs through the same pipeline. watch it work, or drop in your own.
          </p>
        )}

        {(phase === "scan" || (phase === "extract" && !extraction)) && (
          <p className="processing-caret font-mono text-[12px]" style={{ color: "var(--readout)" }}>
            {stepLabel}
          </p>
        )}

        {showReadout && extraction && (
          <div className="paper-card perforated-top rounded-lg px-4 py-1.5 sm:px-5" style={{ paddingTop: "calc(0.375rem + 10px)" }}>
            <ReadoutRow label="type" value={DOC_LABEL[extraction.docType.value ?? "other"]} confidence={extraction.docType.confidence} delay={0} />
            <ReadoutRow label="from" value={extraction.sender.value ?? "—"} confidence={extraction.sender.confidence} delay={110} />
            <ReadoutRow label="to" value={extraction.recipient.value ?? "—"} confidence={extraction.recipient.confidence} delay={220} />
            {extraction.amount.value !== null && (
              <ReadoutRow
                label="amount"
                value={`$${extraction.amount.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                confidence={extraction.amount.confidence}
                delay={330}
              />
            )}
            {extraction.keyDate.value !== null && (
              <ReadoutRow label="due" value={extraction.keyDate.value} confidence={extraction.keyDate.confidence} delay={440} />
            )}
            <ReadoutRow
              label="urgency"
              value={extraction.urgency.value ?? "low"}
              confidence={extraction.urgency.confidence}
              delay={550}
              hot={extraction.urgency.value === "high"}
            />
          </div>
        )}

        {showStamp && extraction && route && (
          <div className="row-in mt-4 flex flex-wrap items-center gap-2" style={{ animationDelay: "60ms" }}>
            <span
              className="font-mono text-[11px] font-semibold uppercase tracking-widest px-3 py-1.5 rounded"
              style={{
                background: "var(--postal-blue)",
                color: "var(--paper)",
                fontFamily: "var(--font-display)",
              }}
            >
              → {ACTION_LABEL[extraction.recommendedAction]}
            </span>
            <span className="font-mono text-[10px]" style={{ color: "var(--readout)" }}>{route.reason}</span>
          </div>
        )}

        {phase === "done" && extraction && (
          <p
            className="row-in mt-3 font-mono text-[11px] leading-relaxed"
            style={{ animationDelay: "120ms", color: "var(--readout)" }}
          >
            {extraction.summary}
          </p>
        )}

        {phase === "done" && meta && (
          <p
            className="row-in mt-3 font-mono text-[10px]"
            style={{ animationDelay: "200ms", color: "rgba(154,163,178,0.55)" }}
          >
            {meta.model} · {(meta.latencyMs / 1000).toFixed(1)}s · ${meta.costUsd.toFixed(4)}
          </p>
        )}
      </div>
    </div>
  );
}
