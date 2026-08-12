"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stage, { type Phase } from "@/components/Stage";
import type { Extraction, ExtractionRecord, MailSample } from "@/lib/types";
import { routeExtraction, CONFIDENCE_THRESHOLD } from "@/lib/types";

const QUERY = /* GraphQL */ `
  query Demo {
    samples { id file label }
    extractions {
      sampleId model latencyMs costUsd
      extraction {
        docType { value confidence }
        sender { value confidence }
        recipient { value confidence }
        amount { value confidence }
        keyDate { value confidence }
        urgency { value confidence }
        summary
        recommendedAction
        overallConfidence
      }
    }
    evalStats {
      model n docType sender recipient amount keyDate action routingSafe autoRate meanLatencyMs costPerDocUsd
    }
  }
`;

interface ModelStats {
  model: string;
  n: number;
  docType: number;
  sender: number;
  amount: number;
  keyDate: number;
  action: number;
  routingSafe: number;
  autoRate: number;
  meanLatencyMs: number;
  costPerDocUsd: number;
}

interface FieldCorrection {
  field: string;
  label: string;
  before: string;
  after: string;
}

interface DeltaResult {
  sampleId: string;
  before: { overallConfidence: number; recommendedAction: string };
  after: {
    extraction: Extraction;
    overallConfidence: number;
    recommendedAction: string;
    latencyMs: number;
  };
  fromCache: boolean;
}

const MODEL = "claude-haiku-4-5";
const pct = (x: number) => `${Math.round(x * 100)}%`;

const EDITABLE_FIELDS: { key: keyof Extraction; label: string; format: (e: Extraction) => string }[] = [
  { key: "sender",    label: "from",    format: (e) => e.sender.value ?? "—" },
  { key: "recipient", label: "to",      format: (e) => e.recipient.value ?? "—" },
  { key: "docType",   label: "type",    format: (e) => e.docType.value ?? "—" },
  { key: "amount",    label: "amount",  format: (e) => e.amount.value !== null ? `$${e.amount.value.toFixed(2)}` : "—" },
  { key: "keyDate",   label: "due",     format: (e) => e.keyDate.value ?? "—" },
  { key: "urgency",   label: "urgency", format: (e) => e.urgency.value ?? "—" },
];

/* ── Postmark SVG (inline, reusable) ─────────────────────────── */
function Postmark({ size = 48, className = "" }: { size?: number; className?: string }) {
  const r = size / 2;
  const outerR = r - 2;
  const innerR = r - 6;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className={className} style={{ opacity: 0.5 }}>
      <circle cx={r} cy={r} r={outerR} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={r} cy={r} r={innerR - 1} fill="none" stroke="currentColor" strokeWidth="1" />
      <line x1={r - 5} y1={r} x2={r + 5} y2={r} stroke="currentColor" strokeWidth="1" />
      <line x1={r} y1={r - 5} x2={r} y2={r + 5} stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

/* ── Section divider with airmail stripe ─────────────────────── */
function AirmailDivider() {
  return <div className="airmail-stripe w-full" aria-hidden />;
}

/* ── Scoreboard number ───────────────────────────────────────── */
function ScoreNum({ big, label, accent }: { big: string; label: string; accent?: boolean }) {
  return (
    <div
      className="rounded-lg p-4 text-center sm:p-6"
      style={{ background: "var(--desk-2)", border: "1px solid rgba(154,163,178,0.07)" }}
    >
      <p
        className="font-mono leading-none"
        style={{
          fontSize: "clamp(1.8rem, 7vw, 3.2rem)",
          fontWeight: 700,
          color: accent ? "var(--postal-blue)" : "var(--readout-hot)",
          letterSpacing: "-0.02em",
        }}
      >
        {big}
      </p>
      <p
        className="mt-2 font-mono text-[8px] uppercase tracking-widest"
        style={{ color: "var(--readout)" }}
      >
        {label}
      </p>
    </div>
  );
}

export default function Page() {
  const [samples, setSamples] = useState<MailSample[]>([]);
  const [records, setRecords] = useState<ExtractionRecord[]>([]);
  const [evalStats, setEvalStats] = useState<ModelStats[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [decisions, setDecisions] = useState<Record<string, "approved" | "corrected">>({});
  const [liveResult, setLiveResult] = useState<{ extraction: Extraction; latencyMs: number } | null>(null);
  const [livePreview, setLivePreview] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [corrections, setCorrections] = useState<Record<string, FieldCorrection[]>>({});
  const [editingField, setEditingField] = useState<{ sampleId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [rerunLoading, setRerunLoading] = useState(false);
  const [rerunResults, setRerunResults] = useState<DeltaResult[] | null>(null);
  const [rerunFromCache, setRerunFromCache] = useState(false);
  const deltaRef = useRef<HTMLDivElement>(null);
  // stable receipt ID — lazy initializer runs once, avoids impure-in-render lint error
  const [receiptId] = useState<string>(() => Math.random().toString(36).slice(2, 8).toUpperCase());

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => {
    const m = new Map<string, ExtractionRecord>();
    for (const r of records) if (r.model === MODEL) m.set(r.sampleId, r);
    return m;
  }, [records]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const play = useCallback((id: string) => {
    clearTimers();
    setLiveResult(null);
    setLivePreview(null);
    setLiveError(null);
    setSelected(id);
    setPhase("scan");
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    timers.current.push(setTimeout(() => setPhase("extract"), 1150));
    timers.current.push(setTimeout(() => setPhase("route"),   2050));
    timers.current.push(setTimeout(() => setPhase("done"),    2600));
  }, []);

  useEffect(() => {
    fetch("/api/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: QUERY }),
    })
      .then((r) => r.json())
      .then(({ data }) => {
        setSamples(data.samples);
        setRecords(data.extractions);
        setEvalStats(data.evalStats);
        const first = data.samples[0]?.id;
        if (first) timers.current.push(setTimeout(() => play(first), 450));
      });
    return clearTimers;
  }, [play]);

  async function handleUpload(file: File) {
    clearTimers();
    setLiveError(null);
    setLiveResult(null);
    setSelected(null);
    setLivePreview(URL.createObjectURL(file));
    setPhase("scan");
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    const started = Date.now();
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      const wait = Math.max(0, 1150 - (Date.now() - started));
      timers.current.push(
        setTimeout(() => {
          setLiveResult(data);
          setPhase("extract");
          timers.current.push(setTimeout(() => setPhase("route"), 900));
          timers.current.push(setTimeout(() => setPhase("done"),  1450));
        }, wait)
      );
    } catch (err) {
      setPhase("idle");
      setLiveError((err as Error).message);
    }
  }

  function startEdit(sampleId: string, field: string, currentValue: string) {
    setEditingField({ sampleId, field });
    setEditValue(currentValue === "—" ? "" : currentValue);
  }

  function commitEdit(sampleId: string, field: string, originalValue: string) {
    if (!editValue.trim() || editValue.trim() === originalValue) {
      setEditingField(null);
      return;
    }
    const label = EDITABLE_FIELDS.find((f) => f.key === field)?.label ?? field;
    setCorrections((prev) => {
      const existing = (prev[sampleId] ?? []).filter((c) => c.field !== field);
      return { ...prev, [sampleId]: [...existing, { field, label, before: originalValue, after: editValue.trim() }] };
    });
    setEditingField(null);
    setDecisions((d) => ({ ...d, [sampleId]: "corrected" }));
    setRerunResults(null);
  }

  const totalCorrections = Object.values(corrections).reduce((n, arr) => n + arr.length, 0);

  async function runReextract() {
    setRerunLoading(true);
    setRerunResults(null);
    try {
      const exemplars = Object.entries(corrections).flatMap(([sampleId, corrs]) => {
        const sample = samples.find((s) => s.id === sampleId);
        return corrs.map((c) => ({ sampleLabel: sample?.label ?? sampleId, field: c.field, before: c.before, after: c.after }));
      });
      const correctedIds = new Set(Object.keys(corrections));
      const rerunIds = reviewItems.map((s) => s.id).filter((id) => !correctedIds.has(id));
      const res = await fetch("/api/reextract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sampleIds: rerunIds, exemplars }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setRerunResults(data.results);
      setRerunFromCache(!!data.fromCache);
      setTimeout(() => deltaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      setLiveError((err as Error).message);
    } finally {
      setRerunLoading(false);
    }
  }

  const current = selected ? byId.get(selected) : undefined;
  const currentSample = samples.find((s) => s.id === selected);
  const stageExtraction = liveResult?.extraction ?? (current?.extraction as Extraction | undefined) ?? null;
  const stageImage = livePreview ?? currentSample?.file ?? null;
  const stageLabel = livePreview ? "your mail" : (currentSample?.label ?? "");
  const stageMeta = liveResult
    ? { model: MODEL, latencyMs: liveResult.latencyMs, costUsd: 0.002 }
    : current
      ? { model: current.model, latencyMs: current.latencyMs, costUsd: current.costUsd }
      : null;

  const reviewItems = samples.filter((s) => {
    const r = byId.get(s.id);
    return r && routeExtraction(r.extraction as Extraction).route === "review";
  });

  const haiku = evalStats.find((s) => s.model === MODEL);

  const afterAutoRate = useMemo(() => {
    if (!rerunResults || !haiku) return null;
    const originalAutoCount = Math.round(haiku.autoRate * haiku.n);
    const reviewIds = new Set(reviewItems.map((s) => s.id));
    let delta = 0;
    for (const r of rerunResults) {
      const wasReview = reviewIds.has(r.sampleId);
      const isNowAuto = routeExtraction(r.after.extraction as Extraction).route === "auto";
      if (wasReview && isNowAuto) delta++;
    }
    return (originalAutoCount + delta) / haiku.n;
  }, [rerunResults, haiku, reviewItems]);

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "var(--desk)" }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => { if (e.relatedTarget === null) setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && f.type.startsWith("image/")) handleUpload(f);
      }}
    >
      {/* DROP OVERLAY */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(15,17,23,0.85)" }}>
          <div
            className="rounded-xl border-2 border-dashed px-8 py-6 text-center"
            style={{ borderColor: "var(--postal-blue)", background: "var(--desk-2)" }}
          >
            <p
              className="font-mono text-[13px] uppercase tracking-widest"
              style={{ fontFamily: "var(--font-display)", color: "var(--readout-hot)" }}
            >
              drop it in the mailroom
            </p>
            <p className="mt-1 font-mono text-[10px]" style={{ color: "var(--readout)" }}>
              png or jpeg · we&apos;ll take it from here
            </p>
          </div>
        </div>
      )}

      {/* ── AIRMAIL STRIPE — very top ─────────────────────────── */}
      <AirmailDivider />

      {/* ── HEADER ───────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 backdrop-blur"
        style={{ background: "rgba(15,17,23,0.92)", borderBottom: "1px solid rgba(154,163,178,0.1)" }}
      >
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            {/* Postmark-style icon */}
            <Postmark size={28} className="text-readout" />
            <span
              className="text-[14px] uppercase tracking-widest"
              style={{ fontFamily: "var(--font-display)", color: "var(--readout-hot)", letterSpacing: "0.1em" }}
            >
              Mailroom Intelligence
            </span>
          </div>
          {/* Step rail — desktop only in header */}
          <div className="hidden sm:flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest" style={{ color: "var(--readout)" }}>
            {(["scan", "extract", "route", "learn"] as const).map((step, i) => (
              <span key={step} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden style={{ color: "rgba(154,163,178,0.25)" }}>→</span>}
                <span style={{ color: step === phase || (step === "learn" && phase === "done") ? "var(--readout-hot)" : "rgba(154,163,178,0.4)" }}>
                  {step}
                </span>
              </span>
            ))}
          </div>
          <nav className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--readout)" }}>
            <a href="#review" className="transition-opacity hover:opacity-100 opacity-70">
              review{reviewItems.length > 0 && <span className="ml-1" style={{ color: "var(--postal-red)" }}>{reviewItems.length}</span>}
            </a>
            <a href="#eval" className="transition-opacity hover:opacity-100 opacity-70">eval</a>
            <a href="https://github.com/mikebatts/mailroom-intelligence" target="_blank" rel="noreferrer" className="hidden transition-opacity hover:opacity-100 opacity-70 sm:inline">code</a>
          </nav>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════
          ACT 1 — HERO
      ═══════════════════════════════════════════════════════ */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-8 pt-10 sm:px-6 sm:pt-16">
        {/* Big type block */}
        <div className="mb-8 sm:mb-12">
          <h1
            className="leading-none tracking-tight uppercase"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.6rem, 11vw, 5.5rem)",
              color: "var(--paper)",
            }}
          >
            mail goes in.
          </h1>
          <h1
            className="leading-none tracking-tight uppercase"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(2.6rem, 11vw, 5.5rem)",
              color: "var(--postal-red)",
            }}
          >
            decisions come out.
          </h1>
          <p
            className="mt-4 font-mono text-[12px] sm:text-[13px] leading-relaxed max-w-lg"
            style={{ color: "var(--readout)" }}
          >
            ai triage for physical mail: reads every piece, routes the confident calls, flags the rest for a human.
          </p>
        </div>

        {/* Pipeline step rail — mobile collapsible chip, desktop deferred to sticky header */}
        <div className="mb-6 sm:hidden">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest"
            style={{ background: "var(--desk-2)", border: "1px solid rgba(154,163,178,0.12)", color: "var(--readout)" }}
          >
            {(["scan", "extract", "route", "learn"] as const).map((step, i) => (
              <span key={step} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden style={{ color: "rgba(154,163,178,0.3)" }}>→</span>}
                <span style={{ color: step === phase || (step === "learn" && phase === "done") ? "var(--readout-hot)" : "rgba(154,163,178,0.4)" }}>
                  {step}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Stage */}
        <div ref={stageRef} className="scroll-mt-16">
          <Stage
            image={stageImage}
            label={stageLabel}
            extraction={stageExtraction}
            phase={phase}
            meta={stageMeta}
            live={!!liveResult}
          />
          {liveError && (
            <p
              className="mt-3 rounded-lg px-4 py-2.5 font-mono text-[11px]"
              style={{ background: "rgba(214,56,44,0.12)", color: "var(--postal-red)" }}
            >
              {liveError}
            </p>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          ACT 2 — THE QUEUE (filmstrip)
      ═══════════════════════════════════════════════════════ */}
      <div className="mt-2">
        <AirmailDivider />
      </div>

      <section className="mx-auto w-full max-w-5xl px-4 pb-10 pt-8 sm:px-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2
            className="uppercase tracking-widest"
            style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.1rem, 4vw, 1.6rem)", color: "var(--readout-hot)" }}
          >
            the queue
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(154,163,178,0.45)" }}>
            tap a piece to run it
          </span>
        </div>

        {/* Horizontal filmstrip on mobile; grid on desktop */}
        <div className="filmstrip -mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:-mx-0 sm:px-0 md:grid md:grid-cols-6 md:overflow-visible md:gap-3">
          {/* upload slot */}
          <button
            onClick={() => inputRef.current?.click()}
            className="filmstrip-card flex h-44 w-[58vw] shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed transition-colors focus-visible:outline focus-visible:outline-2 sm:w-[160px] md:w-auto md:h-36"
            style={{ borderColor: "rgba(36,71,201,0.45)", background: "var(--desk-2)", minWidth: 0 }}
            aria-label="Upload your own mail"
          >
            <span className="text-3xl leading-none" style={{ color: "var(--postal-blue)" }}>+</span>
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--readout)" }}>your mail</span>
            <span className="font-mono text-[8px]" style={{ color: "rgba(154,163,178,0.5)" }}>png · jpg · webp</span>
          </button>

          {samples.map((s) => {
            const r = byId.get(s.id);
            const route = r ? routeExtraction(r.extraction as Extraction).route : null;
            const active = selected === s.id && !livePreview;
            return (
              <button
                key={s.id}
                onClick={() => play(s.id)}
                title={s.label}
                className="filmstrip-card group relative flex h-44 w-[58vw] shrink-0 flex-col overflow-hidden rounded-lg transition-all focus-visible:outline focus-visible:outline-2 sm:w-[160px] md:w-auto md:h-36"
                style={{
                  background: "var(--paper)",
                  border: active
                    ? "2px solid var(--postal-blue)"
                    : "2px solid rgba(154,163,178,0.12)",
                  boxShadow: active ? "0 0 0 1px var(--postal-blue)" : "0 6px 18px rgba(0,0,0,0.35)",
                }}
              >
                {/* perforated top on card */}
                <span className="absolute inset-x-0 top-0 h-2 z-10 pointer-events-none" style={{
                  background: "radial-gradient(circle at center, var(--desk) 3px, transparent 3px) repeat-x top / 14px 8px",
                }} aria-hidden />
                {/* document, whole piece visible on paper */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.file} alt={s.label} loading="lazy" className="min-h-0 w-full flex-1 object-contain px-2 pt-3" />
                {/* meta strip on paper */}
                <span className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate font-mono text-[9px] lowercase tracking-wide" style={{ color: "var(--ink)" }}>
                    {s.label}
                  </span>
                  {route && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 text-[8px] uppercase tracking-widest rounded-sm"
                      style={{
                        fontFamily: "var(--font-display)",
                        background: route === "auto" ? "var(--stamp-green)" : "var(--postal-red)",
                        color: "var(--paper)",
                      }}
                    >
                      {route === "auto" ? "auto" : "review"}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
        />
      </section>

      {/* ═══════════════════════════════════════════════════════
          ACT 3 — REVIEW & LEARN (correction loop)
      ═══════════════════════════════════════════════════════ */}
      <AirmailDivider />

      <section
        id="review"
        className="scroll-mt-16 mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14"
      >
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2
            className="uppercase tracking-widest"
            style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.1rem, 4vw, 1.6rem)", color: "var(--readout-hot)" }}
          >
            review &amp; learn
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest shrink-0" style={{ color: "var(--readout)" }}>
            under {Math.round(CONFIDENCE_THRESHOLD * 100)}% confidence
          </span>
        </div>

        {/* Queue cards on paper */}
        <div className="grid gap-4 sm:grid-cols-2">
          {reviewItems.map((s, i) => {
            const r = byId.get(s.id)!;
            const e = r.extraction as Extraction;
            const decided = decisions[s.id];
            const itemCorrections = corrections[s.id] ?? [];
            return (
              <div
                key={s.id}
                className="tray-in paper-card perforated-top rounded-lg overflow-hidden"
                style={{ animationDelay: `${i * 70}ms`, paddingTop: 10 }}
              >
                <div className="flex gap-3.5 p-3.5">
                  {/* thumbnail */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.file}
                    alt={s.label}
                    loading="lazy"
                    className="h-24 w-20 shrink-0 rounded object-cover object-center"
                    style={{ border: "1px solid rgba(26,28,34,0.1)" }}
                  />
                  <div className="min-w-0 flex-1">
                    {/* header row */}
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className="truncate text-[13px] font-semibold"
                        style={{ color: "var(--ink)" }}
                      >
                        {s.label}
                      </p>
                      <span className="shrink-0 font-mono text-[10px]" style={{ color: "var(--readout)" }}>
                        {Math.round(e.overallConfidence * 100)}%
                      </span>
                    </div>
                    {/* confidence bar */}
                    <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(26,28,34,0.1)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round(e.overallConfidence * 100)}%`,
                          background: e.overallConfidence >= CONFIDENCE_THRESHOLD ? "var(--stamp-green)" : "var(--postal-red)",
                        }}
                      />
                    </div>
                    {/* threshold label */}
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-widest" style={{ color: "rgba(26,28,34,0.4)" }}>
                      auto-route bar {Math.round(CONFIDENCE_THRESHOLD * 100)}%
                    </p>

                    {/* summary */}
                    <p className="mt-1.5 font-mono text-[10px] leading-snug" style={{ color: "rgba(26,28,34,0.55)" }}>{e.summary}</p>

                    {/* editable fields — tap to edit on paper, underline only */}
                    <div className="mt-2.5 space-y-0">
                      {EDITABLE_FIELDS.map((f) => {
                        const originalValue = f.format(e);
                        const corrected = itemCorrections.find((c) => c.field === f.key);
                        const displayValue = corrected ? corrected.after : originalValue;
                        const isEditing = editingField?.sampleId === s.id && editingField?.field === f.key;
                        return (
                          <div
                            key={f.key}
                            className="flex items-center gap-2"
                            style={{ minHeight: 44, borderBottom: "1px solid rgba(26,28,34,0.06)" }}
                          >
                            <span
                              className="w-10 shrink-0 font-mono text-[9px] uppercase tracking-widest"
                              style={{ color: "rgba(26,28,34,0.4)" }}
                            >
                              {f.label}
                            </span>
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editValue}
                                onChange={(ev) => setEditValue(ev.target.value)}
                                onBlur={() => commitEdit(s.id, f.key, originalValue)}
                                onKeyDown={(ev) => {
                                  if (ev.key === "Enter") commitEdit(s.id, f.key, originalValue);
                                  if (ev.key === "Escape") setEditingField(null);
                                }}
                                className="min-w-0 flex-1 bg-transparent font-mono text-[11px] focus:outline-none"
                                style={{
                                  color: "var(--ink)",
                                  borderBottom: "1.5px solid var(--postal-blue)",
                                  paddingBottom: 2,
                                }}
                              />
                            ) : (
                              <button
                                onClick={() => startEdit(s.id, f.key, displayValue)}
                                className="group/field flex min-w-0 flex-1 items-center gap-1.5 rounded text-left focus-visible:outline focus-visible:outline-1"
                                style={{ minHeight: 36 }}
                              >
                                <span
                                  className="min-w-0 truncate font-mono text-[11px]"
                                  style={{ color: corrected ? "var(--postal-blue)" : "var(--ink)", fontWeight: corrected ? 600 : 400 }}
                                >
                                  {displayValue}
                                </span>
                                {corrected ? (
                                  <span
                                    className="corrected-pulse shrink-0 stamp stamp-corrected text-[7px] px-1 py-0.5"
                                    style={{ transform: "rotate(-2deg)" }}
                                  >
                                    corrected
                                  </span>
                                ) : (
                                  <span
                                    className="shrink-0 font-mono text-[8px] uppercase tracking-widest opacity-0 group-hover/field:opacity-100 transition-opacity"
                                    style={{ color: "rgba(26,28,34,0.3)" }}
                                  >
                                    edit
                                  </span>
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* approve / correct buttons */}
                    <div className="mt-3 flex gap-2">
                      {decided ? (
                        <span
                          className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded"
                          style={{
                            background: decided === "approved" ? "rgba(30,111,71,0.12)" : "rgba(214,56,44,0.1)",
                            color: decided === "approved" ? "var(--stamp-green)" : "var(--postal-red)",
                            border: `1px solid ${decided === "approved" ? "var(--stamp-green)" : "var(--postal-red)"}`,
                          }}
                        >
                          {decided === "approved" ? "✓ approved" : "✎ corrected"}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => setDecisions((d) => ({ ...d, [s.id]: "approved" }))}
                            className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2"
                            style={{ background: "var(--stamp-green)", color: "var(--paper)", minHeight: 36 }}
                          >
                            approve
                          </button>
                          <button
                            onClick={() => setDecisions((d) => ({ ...d, [s.id]: "corrected" }))}
                            className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 rounded transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2"
                            style={{ background: "rgba(26,28,34,0.08)", color: "var(--ink)", border: "1px solid rgba(26,28,34,0.15)", minHeight: 36 }}
                          >
                            correct
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {reviewItems.length === 0 && (
            <p className="font-mono text-[11px]" style={{ color: "var(--readout)" }}>queue is clear.</p>
          )}
        </div>

        {/* Correction loop CTA */}
        {totalCorrections > 0 && (
          <div
            className="mt-6 rounded-lg p-4 sm:p-5"
            style={{ background: "var(--desk-2)", border: "1px solid rgba(36,71,201,0.2)" }}
          >
            <p
              className="font-mono text-[10px] uppercase tracking-widest mb-1.5"
              style={{ color: "var(--postal-blue)", fontFamily: "var(--font-display)", letterSpacing: "0.14em" }}
            >
              ▸ the reviewer teaches the machine
            </p>
            <p className="font-mono text-[12px] mb-4" style={{ color: "var(--readout-hot)" }}>
              {totalCorrections} correction{totalCorrections !== 1 ? "s" : ""} queued
              <span style={{ color: "var(--readout)" }}> — re-run the remaining docs with {totalCorrections !== 1 ? "these" : "this"} as few-shot example{totalCorrections !== 1 ? "s" : ""}.</span>
            </p>
            {/* The big CTA button */}
            <button
              onClick={runReextract}
              disabled={rerunLoading}
              className="w-full rounded-md py-4 uppercase tracking-wider transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline focus-visible:outline-2"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "clamp(0.85rem, 2.5vw, 1.1rem)",
                background: "var(--postal-red)",
                color: "var(--paper)",
                minHeight: 52,
              }}
            >
              {rerunLoading ? "running..." : "re-run queue with corrections"}
            </button>
            <p className="mt-3 font-mono text-[9px]" style={{ color: "rgba(154,163,178,0.45)" }}>
              hint: correct the &ldquo;handwritten check&rdquo; sender field to see the canned demo — the model closes the gap on the utility bill.
            </p>
          </div>
        )}
      </section>

      {/* ── FRANKING RECEIPT — delta panel ───────────────────── */}
      {rerunResults && (
        <>
          <AirmailDivider />
          <section
            ref={deltaRef}
            className="scroll-mt-16 mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14"
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2
                className="uppercase tracking-widest"
                style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.1rem, 4vw, 1.6rem)", color: "var(--readout-hot)" }}
              >
                before → after
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(154,163,178,0.4)" }}>
                {rerunFromCache ? "canned demo · cached" : "live re-extraction"}
              </span>
            </div>

            {/* Headline stat changes */}
            {haiku && afterAutoRate !== null && (
              <div className="receipt-reveal paper-card perforated-top rounded-lg mb-5" style={{ paddingTop: 10 }}>
                <div className="grid grid-cols-3 divide-x" style={{ borderColor: "rgba(26,28,34,0.08)" }}>
                  {[
                    { label: "auto-route", before: pct(haiku.autoRate), after: pct(afterAutoRate), changed: afterAutoRate !== haiku.autoRate },
                    { label: "safe routing", before: pct(haiku.routingSafe), after: pct(haiku.routingSafe), changed: false },
                    { label: "corrections", before: null, after: String(totalCorrections), changed: false },
                  ].map((stat, i) => (
                    <div
                      key={i}
                      className="delta-in px-3 py-4 text-center"
                      style={{ animationDelay: `${i * 80}ms`, borderRight: i < 2 ? "1px solid rgba(26,28,34,0.08)" : undefined }}
                    >
                      <p className="font-mono text-[9px] uppercase tracking-widest mb-2" style={{ color: "rgba(26,28,34,0.4)" }}>
                        {stat.label}
                      </p>
                      {stat.before !== null && (
                        <p className="font-mono text-[11px] line-through" style={{ color: "rgba(26,28,34,0.35)" }}>
                          {stat.before}
                        </p>
                      )}
                      <p
                        className="font-mono text-xl font-semibold"
                        style={{ color: stat.changed ? "var(--stamp-green)" : "var(--ink)" }}
                      >
                        {stat.after}
                      </p>
                    </div>
                  ))}
                </div>
                {/* Tear line */}
                <div className="receipt-tearline mx-4" />
                <p className="px-4 pb-4 font-mono text-[10px]" style={{ color: "rgba(26,28,34,0.45)" }}>
                  printed {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} · ref #{receiptId}
                </p>
              </div>
            )}

            {/* Per-doc delta rows — receipt style */}
            <div
              className="receipt-reveal paper-card perforated-top rounded-lg overflow-hidden"
              style={{ paddingTop: 10 }}
            >
              {rerunResults.map((r, i) => {
                const sample = samples.find((s) => s.id === r.sampleId);
                const priorRecord = byId.get(r.sampleId);
                const routeBefore = priorRecord ? routeExtraction(priorRecord.extraction as Extraction).route : "review";
                const routeAfter = routeExtraction(r.after.extraction as Extraction).route;
                const improved = routeAfter === "auto" && routeBefore === "review";
                const confDelta = r.after.overallConfidence - r.before.overallConfidence;
                return (
                  <div
                    key={r.sampleId}
                    className="delta-in px-4 py-3.5"
                    style={{
                      animationDelay: `${i * 80}ms`,
                      borderBottom: i < rerunResults.length - 1 ? "1px dashed rgba(26,28,34,0.15)" : undefined,
                    }}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-mono text-[12px] font-semibold" style={{ color: "var(--ink)" }}>
                        {sample?.label ?? r.sampleId}
                      </p>
                      {improved && (
                        <span className="stamp stamp-auto stamp-in">now auto-routed</span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3 font-mono text-[11px]">
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-widest mb-1" style={{ color: "rgba(26,28,34,0.4)" }}>before</p>
                        <p style={{ color: "rgba(26,28,34,0.5)" }}>conf {Math.round(r.before.overallConfidence * 100)}%</p>
                        <p style={{ color: "rgba(26,28,34,0.5)" }}>{routeBefore}</p>
                      </div>
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-widest mb-1" style={{ color: "rgba(26,28,34,0.4)" }}>after</p>
                        <p style={{ color: confDelta > 0 ? "var(--stamp-green)" : "var(--ink)" }}>
                          conf {Math.round(r.after.overallConfidence * 100)}%
                          {confDelta !== 0 && (
                            <span className="ml-1 text-[9px]">({confDelta > 0 ? "+" : ""}{Math.round(confDelta * 100)}pt)</span>
                          )}
                        </p>
                        <p style={{ color: routeAfter === "auto" ? "var(--stamp-green)" : "var(--ink)", fontWeight: routeAfter === "auto" ? 600 : 400 }}>
                          {routeAfter}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="receipt-tearline mx-4" />
              <div className="px-4 pb-4">
                <p className="font-mono text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "var(--postal-red)" }}>
                  what just happened
                </p>
                <p className="font-mono text-[11px] leading-relaxed" style={{ color: "rgba(26,28,34,0.65)" }}>
                  the correction told the model: on this batch, the sender field of a handwritten check is the check writer, not the drawee bank. the model applied that to the next ambiguous doc it saw, raising its confidence on the utility bill enough to clear the routing bar. one human correction, one less item in the queue.
                </p>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
          ACT 4 — THE EVAL (back on dark desk)
      ═══════════════════════════════════════════════════════ */}
      <AirmailDivider />

      <section
        id="eval"
        className="scroll-mt-16 mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14"
      >
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2
            className="uppercase tracking-widest"
            style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.1rem, 4vw, 1.6rem)", color: "var(--readout-hot)" }}
          >
            the eval
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest shrink-0" style={{ color: "rgba(154,163,178,0.45)" }}>
            {haiku?.n ?? 0} labeled samples · 2 models
          </span>
        </div>

        {/* Big scoreboard numbers — on dark desk */}
        <div className="mb-8 grid grid-cols-3 gap-4 sm:gap-6">
          <ScoreNum big={haiku ? pct(haiku.routingSafe) : "—"} label="safe routing" accent />
          <ScoreNum big={haiku ? `$${haiku.costPerDocUsd.toFixed(3)}` : "—"} label="per doc" />
          <ScoreNum big={haiku ? `${(haiku.meanLatencyMs / 1000).toFixed(1)}s` : "—"} label="latency" />
        </div>

        {/* Per-field ledger on paper */}
        <div className="paper-card perforated-top rounded-lg overflow-x-auto" style={{ paddingTop: 10 }}>
          <table className="w-full min-w-[560px] text-[12px]">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(26,28,34,0.1)" }}>
                {["model", "type", "sender", "amount", "deadline", "action", "safe", "auto", "latency", "cost"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-3 text-left font-mono text-[9px] uppercase tracking-widest"
                    style={{ color: h === "safe" ? "var(--stamp-green)" : "rgba(26,28,34,0.4)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="font-mono">
              {evalStats.map((s, i) => (
                <tr key={s.model} style={{ borderBottom: i < evalStats.length - 1 ? "1px solid rgba(26,28,34,0.05)" : undefined }}>
                  <td className="px-3 py-3 text-[11px] font-semibold" style={{ color: "var(--ink)" }}>{s.model.replace("claude-", "")}</td>
                  <td className="px-3 py-3" style={{ color: "var(--ink)" }}>{pct(s.docType)}</td>
                  <td className="px-3 py-3" style={{ color: "var(--ink)" }}>{pct(s.sender)}</td>
                  <td className="px-3 py-3" style={{ color: "var(--ink)" }}>{pct(s.amount)}</td>
                  <td className="px-3 py-3" style={{ color: "var(--ink)" }}>{pct(s.keyDate)}</td>
                  <td className="px-3 py-3" style={{ color: "var(--ink)" }}>{pct(s.action)}</td>
                  <td className="px-3 py-3 font-semibold" style={{ color: "var(--stamp-green)" }}>{pct(s.routingSafe)}</td>
                  <td className="px-3 py-3" style={{ color: "var(--ink)" }}>{pct(s.autoRate)}</td>
                  <td className="px-3 py-3" style={{ color: "var(--ink)" }}>{(s.meanLatencyMs / 1000).toFixed(1)}s</td>
                  <td className="px-3 py-3" style={{ color: "var(--ink)" }}>${s.costPerDocUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="receipt-tearline mx-4" />

          {/* Typed-memo eval story */}
          <div className="px-4 pb-5 pt-1">
            <p
              className="font-mono text-[10px] uppercase tracking-widest mb-2"
              style={{ color: "var(--postal-red)", fontFamily: "var(--font-display)", letterSpacing: "0.14em" }}
            >
              ▸ what the eval changed
            </p>
            <p className="font-mono text-[11px] leading-relaxed" style={{ color: "rgba(26,28,34,0.65)" }}>
              first pass auto-routed a wrongly-actioned utility bill at 0.88 confidence. raising the bar to 0.90 traded ~20 points of automation for 100% safe routing. you only get to make that trade on purpose when you measure.
            </p>
            <p
              className="font-mono text-[10px] uppercase tracking-widest mt-5 mb-2"
              style={{ color: "var(--postal-red)", fontFamily: "var(--font-display)", letterSpacing: "0.14em" }}
            >
              ▸ what the reviewer changed
            </p>
            <p className="font-mono text-[11px] leading-relaxed" style={{ color: "rgba(26,28,34,0.65)" }}>
              correcting one field on a handwritten check propagated as a few-shot exemplar to the re-extraction pass. the model updated its interpretation of &ldquo;sender&rdquo; for the ambiguous utility bill and cleared the confidence bar without any prompt editing.
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <AirmailDivider />
      <footer style={{ background: "var(--desk-2)", borderTop: "1px solid rgba(154,163,178,0.06)" }}>
        <p className="mx-auto w-full max-w-5xl px-4 py-5 font-mono text-[10px] uppercase tracking-widest sm:px-6" style={{ color: "rgba(154,163,178,0.4)" }}>
          built by{" "}
          <a
            href="https://mikebatts.net"
            className="transition-opacity hover:opacity-80"
            style={{ color: "var(--readout)" }}
          >
            mike battaglia
          </a>{" "}
          for the team at stable · not affiliated · synthetic mail only ·{" "}
          <a
            href="https://github.com/mikebatts/mailroom-intelligence"
            className="transition-opacity hover:opacity-80"
            style={{ color: "var(--readout)" }}
          >
            github
          </a>{" "}
          · next.js · typescript · graphql · claude vision
        </p>
      </footer>
    </div>
  );
}
