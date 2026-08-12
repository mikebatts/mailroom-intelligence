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

/* ── Micro confidence bar ────────────────────────────────────── */
function MicroBar({ value, delay }: { value: number; delay: number }) {
  const isHigh = value >= CONFIDENCE_THRESHOLD;
  const color = isHigh ? "var(--accent)" : "var(--orange)";
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span
        style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 11,
          color: "var(--text-secondary)",
          letterSpacing: "-0.01em",
        }}
      >
        {Math.round(value * 100)}%
      </span>
      <span
        className="relative h-[3px] rounded-full overflow-hidden"
        style={{ width: 40, background: "rgba(0,0,0,0.07)" }}
      >
        <span
          className="bar-fill absolute left-0 top-0 h-full rounded-full"
          style={{
            width: `${Math.round(value * 100)}%`,
            background: color,
            animationDelay: `${delay}ms`,
          }}
        />
      </span>
    </span>
  );
}

/* ── Grouped-inset row (iOS Settings style) ──────────────────── */
function ExtractRow({
  label,
  value,
  confidence,
  delay,
  hot,
  isFirst,
  isLast,
}: {
  label: string;
  value: string;
  confidence?: number;
  delay: number;
  hot?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <div
      className="row-in flex items-center justify-between gap-3 px-4"
      style={{
        animationDelay: `${delay}ms`,
        minHeight: 48,
        borderBottom: isLast ? "none" : "1px solid var(--hairline)",
        borderRadius: isFirst && isLast ? 12 : isFirst ? "12px 12px 0 0" : isLast ? "0 0 12px 12px" : 0,
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span className="flex items-center gap-3 min-w-0">
        <span
          className="break-words text-right"
          style={{
            fontSize: 15,
            fontWeight: 500,
            lineHeight: 1.3,
            color: hot ? "var(--red)" : "var(--text-primary)",
          }}
        >
          {value}
        </span>
        {confidence !== undefined && <MicroBar value={confidence} delay={delay + 120} />}
      </span>
    </div>
  );
}

/* ── Route decision pill ─────────────────────────────────────── */
function RoutePill({ route }: { route: "auto" | "review" }) {
  const isAuto = route === "auto";
  return (
    <span
      className="pill-spring inline-flex items-center gap-1.5 rounded-full px-3 py-1"
      style={{
        background: isAuto ? "var(--green-bg)" : "var(--orange-bg)",
        color: isAuto ? "var(--green-text)" : "var(--orange-text)",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span
        className="inline-block rounded-full"
        style={{
          width: 7,
          height: 7,
          background: isAuto ? "var(--green)" : "var(--orange)",
          flexShrink: 0,
        }}
      />
      {isAuto ? "auto-routed" : "needs review"}
    </span>
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
  const showRoute = phase === "route" || phase === "done";
  const route = extraction ? routeExtraction(extraction) : null;

  const steps: { id: Phase; label: string }[] = [
    { id: "scan", label: "read" },
    { id: "extract", label: "decide" },
    { id: "route", label: "route" },
  ];
  const stepOrder: Phase[] = ["scan", "extract", "route", "done"];
  const stepState = (id: Phase) => {
    const cur = stepOrder.indexOf(phase);
    const mine = stepOrder.indexOf(id);
    if (phase === "idle") return "todo";
    if (mine < cur || phase === "done") return "done";
    if (mine === cur) return "active";
    return "todo";
  };

  /* build ordered rows from extraction */
  const rows = extraction
    ? [
        { label: "type", value: DOC_LABEL[extraction.docType.value ?? "other"] ?? "other", conf: extraction.docType.confidence, delay: 0 },
        { label: "from", value: extraction.sender.value ?? "—", conf: extraction.sender.confidence, delay: 80 },
        { label: "to", value: extraction.recipient.value ?? "—", conf: extraction.recipient.confidence, delay: 160 },
        ...(extraction.amount.value !== null
          ? [{ label: "amount", value: `$${extraction.amount.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, conf: extraction.amount.confidence, delay: 240 }]
          : []),
        ...(extraction.keyDate.value !== null
          ? [{ label: "due", value: extraction.keyDate.value, conf: extraction.keyDate.confidence, delay: 320 }]
          : []),
        { label: "urgency", value: extraction.urgency.value ?? "low", conf: extraction.urgency.confidence, delay: 400, hot: extraction.urgency.value === "high" },
      ]
    : [];

  return (
    <div className="grid gap-5 md:grid-cols-[1.1fr_1fr] md:gap-8">
      {/* ── MAIL IMAGE ─────────────────────────────────────── */}
      <div className="relative min-w-0">
        <div
          className="glass relative overflow-hidden"
          style={{ borderRadius: 28, minHeight: 240 }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={label}
              className="max-h-[32vh] w-full object-contain sm:max-h-[440px]"
              style={{ padding: "12px 12px 8px" }}
            />
          ) : (
            <div
              className="flex h-60 items-center justify-center"
              style={{ color: "var(--text-tertiary)", fontSize: 14 }}
            >
              select a piece of mail below
            </div>
          )}
          {phase === "scan" && <div className="scan-beam" />}

          {/* Route pill overlay */}
          {showRoute && route && (
            <div className="absolute right-4 top-4">
              <RoutePill route={route.route} />
            </div>
          )}
        </div>

        {/* Caption */}
        <p
          className="mt-2 text-center"
          style={{ fontSize: 12, color: "var(--text-secondary)" }}
        >
          {label}{live && " · live"}
        </p>
      </div>

      {/* ── READOUT PANEL ──────────────────────────────────── */}
      <div className="flex min-w-0 flex-col justify-center gap-4">
        {/* Segmented step indicator */}
        <div
          className="glass-sm inline-flex items-center self-start"
          style={{ borderRadius: 12, padding: "4px 6px", gap: 4 }}
          aria-label="Pipeline progress"
        >
          {steps.map((s) => {
            const st = stepState(s.id);
            const isActive = st === "active";
            return (
              <span
                key={s.id}
                style={{
                  borderRadius: 8,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: isActive || st === "done" ? 600 : 400,
                  color: isActive ? "var(--text-primary)" : st === "done" ? "var(--accent)" : "var(--text-tertiary)",
                  background: isActive ? "rgba(255,255,255,0.9)" : "transparent",
                  boxShadow: isActive ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.25s cubic-bezier(0.32,0.72,0,1)",
                  whiteSpace: "nowrap",
                }}
              >
                {s.label}
              </span>
            );
          })}
        </div>

        {/* Idle / scanning state */}
        {(phase === "idle" || (phase === "scan" && !extraction)) && (
          <p
            className={phase === "scan" ? "processing-caret" : ""}
            style={{ fontSize: 15, color: "var(--text-secondary)", lineHeight: 1.5 }}
          >
            {phase === "idle"
              ? "every piece of mail below runs through the same pipeline. watch it work, or drop in your own."
              : "scanning"}
          </p>
        )}

        {/* Extracted fields — grouped inset card */}
        {showReadout && extraction && rows.length > 0 && (
          <div
            className="glass-sm overflow-hidden"
            style={{ borderRadius: 16 }}
          >
            {rows.map((row, i) => (
              <ExtractRow
                key={row.label}
                label={row.label}
                value={row.value}
                confidence={row.conf}
                delay={row.delay}
                hot={row.hot}
                isFirst={i === 0}
                isLast={i === rows.length - 1}
              />
            ))}
          </div>
        )}

        {/* Action + route reason */}
        {showRoute && extraction && route && (
          <div className="row-in flex flex-wrap items-center gap-2" style={{ animationDelay: "80ms" }}>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
              style={{
                background: "var(--accent)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {ACTION_LABEL[extraction.recommendedAction]}
            </span>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>{route.reason}</span>
          </div>
        )}

        {/* Summary */}
        {phase === "done" && extraction && (
          <p
            className="row-in"
            style={{ animationDelay: "120ms", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}
          >
            {extraction.summary}
          </p>
        )}

        {/* Model meta */}
        {phase === "done" && meta && (
          <p
            className="row-in"
            style={{
              animationDelay: "200ms",
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 12,
              color: "var(--text-tertiary)",
            }}
          >
            {meta.model} · {(meta.latencyMs / 1000).toFixed(1)}s · ${meta.costUsd.toFixed(4)}
          </p>
        )}

        {/* Threshold footnote — only once, small */}
        {showReadout && (
          <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            auto-routes at {Math.round(CONFIDENCE_THRESHOLD * 100)}% overall confidence
          </p>
        )}
      </div>
    </div>
  );
}
