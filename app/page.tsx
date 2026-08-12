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
  { key: "docType",   label: "type",    format: (e) => (e.docType.value ?? "—").replace(/_/g, " ") },
  { key: "amount",    label: "amount",  format: (e) => e.amount.value !== null ? `$${e.amount.value.toFixed(2)}` : "—" },
  { key: "keyDate",   label: "due",     format: (e) => e.keyDate.value ?? "—" },
  { key: "urgency",   label: "urgency", format: (e) => e.urgency.value ?? "—" },
];

/* ── Envelope glyph (app icon) ───────────────────────────────── */
function EnvelopeGlyph({ size = 22, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none" aria-hidden>
      <rect x="1.5" y="4.5" width="19" height="13" rx="3.5" fill={color} opacity="0.13" />
      <rect x="1.5" y="4.5" width="19" height="13" rx="3.5" stroke={color} strokeWidth="1.4" />
      <path d="M2 6.5L11 13L20 6.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Stat card (eval trio) ───────────────────────────────────── */
function StatCard({ big, label }: { big: string; label: string }) {
  return (
    <div
      className="glass flex flex-col items-center justify-center px-4 py-5 text-center"
      style={{ borderRadius: 20 }}
    >
      <p
        style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: "clamp(1.6rem,6vw,2.4rem)",
          fontWeight: 700,
          color: "var(--accent)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {big}
      </p>
      <p
        className="micro-label mt-2"
        style={{ fontSize: 11 }}
      >
        {label}
      </p>
    </div>
  );
}

/* ── Route pill (filmstrip card) ─────────────────────────────── */
function FilmPill({ route }: { route: "auto" | "review" }) {
  const isAuto = route === "auto";
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5"
      style={{
        background: isAuto ? "var(--green-bg)" : "var(--orange-bg)",
        color: isAuto ? "var(--green-text)" : "var(--orange-text)",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: isAuto ? "var(--green)" : "var(--orange)",
          flexShrink: 0,
        }}
      />
      {isAuto ? "auto" : "review"}
    </span>
  );
}

/* ── Scroll fade-up hook ─────────────────────────────────────── */
function useFadeUp(ref: React.RefObject<Element | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("visible"); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
}

function FadeSection({ children, className = "", style = {}, id }: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useFadeUp(ref as React.RefObject<Element>);
  return (
    <div ref={ref} id={id} className={`fade-up ${className}`} style={style}>
      {children}
    </div>
  );
}

/* ── Count-up hook ───────────────────────────────────────────── */
function useCountUp(target: number, decimals = 0, duration = 900) {
  const [display, setDisplay] = useState("0");
  const animRef = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const val = target * ease;
      setDisplay(val.toFixed(decimals));
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [target, decimals, duration]);
  return display;
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

  const reviewItems = useMemo(() => samples.filter((s) => {
    const r = byId.get(s.id);
    return r && routeExtraction(r.extraction as Extraction).route === "review";
  }), [samples, byId]);

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

  /* Count-up values for stat cards */
  const routingSafeCount = useCountUp(haiku ? haiku.routingSafe * 100 : 0, 0, 900);
  const latencyCount = useCountUp(haiku ? haiku.meanLatencyMs / 1000 : 0, 1, 900);

  return (
    <div
      className="flex min-h-screen flex-col"
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
        <div
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(245,245,247,0.85)", backdropFilter: "blur(12px)" }}
        >
          <div
            className="glass text-center px-10 py-8"
            style={{ borderRadius: 28, borderStyle: "dashed", borderColor: "var(--accent)" }}
          >
            <p style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>Drop to run it</p>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4 }}>png or jpeg</p>
          </div>
        </div>
      )}

      {/* ── STICKY NAV ───────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: "rgba(245,245,247,0.8)",
          backdropFilter: "blur(28px) saturate(1.6)",
          WebkitBackdropFilter: "blur(28px) saturate(1.6)",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <div
          className="mx-auto flex w-full items-center justify-between px-4 py-3 sm:px-6"
          style={{ maxWidth: 1000 }}
        >
          {/* App glyph + name */}
          <div className="flex items-center gap-2.5">
            <span
              className="flex items-center justify-center"
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: "var(--accent)",
                color: "#fff",
                flexShrink: 0,
              }}
            >
              <EnvelopeGlyph size={17} color="#fff" />
            </span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              Mailroom Intelligence
            </span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <span
              className="hidden sm:inline-flex items-center rounded-full px-3 py-1"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-secondary)",
                background: "rgba(0,0,0,0.04)",
                border: "1px solid var(--glass-border)",
              }}
            >
              built for stable
            </span>
            <a
              href="https://github.com/mikebatts/mailroom-intelligence"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 13, color: "var(--accent)", fontWeight: 500 }}
            >
              github
            </a>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════
          STEP 1 — IT READS (hero + demo)
      ═══════════════════════════════════════════════════════ */}
      <section
        className="mx-auto w-full px-4 sm:px-6"
        style={{ maxWidth: 1000, paddingTop: "clamp(3rem,8vh,5rem)", paddingBottom: "clamp(2rem,5vh,3.5rem)" }}
      >
        {/* Hero text */}
        <div className="mb-8 sm:mb-12">
          <p className="hero-1 micro-label mb-3">step 1 · it reads</p>
          <h1 className="hero-2 hero-title">Mail, handled.</h1>
          <p
            className="hero-3 mt-4"
            style={{
              fontSize: "clamp(15px,2.5vw,18px)",
              color: "var(--text-secondary)",
              maxWidth: 520,
              lineHeight: 1.6,
            }}
          >
            AI triage for physical mail. It reads every piece, routes the confident calls, and asks a human about the rest.
          </p>
        </div>

        {/* Demo card */}
        <div
          ref={stageRef}
          className="hero-4 glass scroll-mt-20"
          style={{ borderRadius: 28, padding: "clamp(16px,4vw,28px)" }}
        >
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
              className="mt-3 rounded-xl px-4 py-3"
              style={{
                background: "var(--red-bg)",
                color: "var(--red)",
                fontSize: 13,
                fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              }}
            >
              {liveError}
            </p>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════
          STEP 2 — THE INBOX (carousel)
      ═══════════════════════════════════════════════════════ */}
      <FadeSection
        className="mx-auto w-full px-4 sm:px-6"
        style={{ maxWidth: 1000, paddingBottom: "clamp(2rem,5vh,3.5rem)" }}
      >
        <p className="micro-label mb-3">step 2 · you choose</p>
        <h2 className="section-title mb-6">The inbox</h2>

        {/* Carousel — mobile scroll-snap, desktop wrapping grid */}
        <div
          className="filmstrip -mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:-mx-0 sm:px-0 md:grid md:overflow-visible md:gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
        >
          {/* Upload card */}
          <button
            onClick={() => inputRef.current?.click()}
            className="filmstrip-card glass flex h-48 w-[72vw] shrink-0 flex-col items-center justify-center gap-2 focus-visible:outline focus-visible:outline-2 sm:w-[160px] md:h-44 md:w-auto"
            style={{
              borderRadius: 20,
              borderStyle: "dashed",
              borderColor: "rgba(10,132,255,0.3)",
              minWidth: 0,
              transition: "transform 0.12s, opacity 0.12s",
            }}
            aria-label="Upload your own mail"
          >
            <span style={{ fontSize: 28, color: "var(--accent)", lineHeight: 1 }}>+</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>try your own</span>
            <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>png · jpg · webp</span>
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
                className="filmstrip-card group relative flex h-48 w-[72vw] shrink-0 flex-col overflow-hidden focus-visible:outline focus-visible:outline-2 sm:w-[160px] md:h-44 md:w-auto"
                style={{
                  background: "rgba(255,255,255,0.88)",
                  borderRadius: 20,
                  border: active
                    ? "2px solid var(--accent)"
                    : "1px solid var(--glass-border)",
                  boxShadow: active
                    ? "0 0 0 3px rgba(10,132,255,0.18), 0 8px 28px rgba(0,0,0,0.09)"
                    : "0 4px 20px rgba(0,0,0,0.07)",
                  transition: "box-shadow 0.2s, border-color 0.2s, transform 0.12s",
                  minWidth: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.file}
                  alt={s.label}
                  loading="lazy"
                  className="min-h-0 w-full flex-1 object-contain"
                  style={{ padding: "12px 12px 6px" }}
                />
                <span
                  className="flex items-center justify-between gap-1.5 px-3 pb-3"
                >
                  <span
                    className="truncate"
                    style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}
                  >
                    {s.label}
                  </span>
                  {route && <FilmPill route={route} />}
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
      </FadeSection>

      {/* ═══════════════════════════════════════════════════════
          STEP 3 — IT LEARNS (correction loop)
      ═══════════════════════════════════════════════════════ */}
      <FadeSection
        id="review"
        className="mx-auto w-full scroll-mt-20 px-4 sm:px-6"
        style={{ maxWidth: 1000, paddingBottom: "clamp(2rem,5vh,4rem)" }}
      >
        <p className="micro-label mb-3">step 3 · it learns</p>
        <h2 className="section-title mb-2">Teach it</h2>
        <p style={{ fontSize: 15, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6 }}>
          Fix one field. The queue re-runs with your correction as an example.
        </p>

        {/* Review queue */}
        <div className="grid gap-4 sm:grid-cols-2">
          {reviewItems.map((s, i) => {
            const r = byId.get(s.id)!;
            const e = r.extraction as Extraction;
            const decided = decisions[s.id];
            const itemCorrections = corrections[s.id] ?? [];
            return (
              <div
                key={s.id}
                className="tray-in glass"
                style={{
                  borderRadius: 20,
                  animationDelay: `${i * 70}ms`,
                  overflow: "hidden",
                }}
              >
                <div className="flex gap-3 p-4">
                  {/* Thumbnail */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.file}
                    alt={s.label}
                    loading="lazy"
                    className="h-24 w-20 shrink-0 rounded-xl object-cover object-center"
                    style={{ border: "1px solid var(--glass-border)" }}
                  />

                  <div className="min-w-0 flex-1">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{s.label}</p>
                        <p style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                          {Math.round(e.overallConfidence * 100)}% confidence · below {Math.round(CONFIDENCE_THRESHOLD * 100)}% bar
                        </p>
                      </div>
                    </div>

                    {/* Editable rows — grouped inset style */}
                    <div
                      style={{
                        background: "var(--bg-glass-nested)",
                        borderRadius: 12,
                        border: "1px solid var(--glass-border)",
                        overflow: "hidden",
                      }}
                    >
                      {EDITABLE_FIELDS.map((f, fi) => {
                        const originalValue = f.format(e);
                        const corrected = itemCorrections.find((c) => c.field === f.key);
                        const displayValue = corrected ? corrected.after : originalValue;
                        const isEditing = editingField?.sampleId === s.id && editingField?.field === f.key;
                        const isLast = fi === EDITABLE_FIELDS.length - 1;
                        return (
                          <div
                            key={f.key}
                            style={{
                              minHeight: 44,
                              borderBottom: isLast ? "none" : "1px solid var(--hairline)",
                              display: "flex",
                              alignItems: "center",
                              padding: "0 12px",
                              gap: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                color: "var(--text-secondary)",
                                width: 52,
                                flexShrink: 0,
                              }}
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
                                className="min-w-0 flex-1 bg-transparent focus:outline-none"
                                style={{
                                  fontSize: 14,
                                  color: "var(--text-primary)",
                                  borderBottom: "1.5px solid var(--accent)",
                                  paddingBottom: 2,
                                  caretColor: "var(--accent)",
                                }}
                              />
                            ) : (
                              <button
                                onClick={() => startEdit(s.id, f.key, displayValue)}
                                className="group/field flex min-w-0 flex-1 items-center justify-between gap-2 text-left focus-visible:outline focus-visible:outline-1"
                                style={{ minHeight: 36 }}
                              >
                                <span
                                  className="min-w-0 break-words"
                                  style={{
                                    fontSize: 14,
                                    lineHeight: 1.35,
                                    color: corrected ? "var(--accent)" : "var(--text-primary)",
                                    fontWeight: corrected ? 600 : 400,
                                  }}
                                >
                                  {displayValue}
                                </span>
                                {corrected ? (
                                  <span
                                    className="edited-dot shrink-0 inline-block rounded-full"
                                    style={{ width: 7, height: 7, background: "var(--accent)", flexShrink: 0 }}
                                    title="edited"
                                  />
                                ) : (
                                  <span
                                    className="shrink-0 opacity-0 group-hover/field:opacity-100 transition-opacity"
                                    style={{ fontSize: 11, color: "var(--accent)" }}
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

                    {/* Approve / correct status */}
                    <div className="mt-3">
                      {decided ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1"
                          style={{
                            background: decided === "approved" ? "var(--green-bg)" : "rgba(10,132,255,0.1)",
                            color: decided === "approved" ? "var(--green-text)" : "var(--accent)",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {decided === "approved" ? "approved" : "corrected"}
                        </span>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDecisions((d) => ({ ...d, [s.id]: "approved" }))}
                            className="btn-secondary"
                            style={{ minHeight: 36, fontSize: 13, padding: "0 14px" }}
                          >
                            approve
                          </button>
                          <button
                            onClick={() => setDecisions((d) => ({ ...d, [s.id]: "corrected" }))}
                            style={{
                              minHeight: 36,
                              fontSize: 13,
                              padding: "0 14px",
                              borderRadius: 50,
                              border: "1px solid var(--glass-border)",
                              background: "transparent",
                              color: "var(--text-secondary)",
                              cursor: "pointer",
                              transition: "opacity 0.12s",
                            }}
                          >
                            mark corrected
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {reviewItems.length === 0 && (
            <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>The queue is clear.</p>
          )}
        </div>

        {/* CTA area */}
        <div className="mt-6">
          {totalCorrections > 0 ? (
            <div
              className="glass p-5 sm:p-6"
              style={{ borderRadius: 20, borderColor: "rgba(10,132,255,0.2)" }}
            >
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
                {totalCorrections} correction{totalCorrections !== 1 ? "s" : ""} queued. Re-run the remaining docs with {totalCorrections !== 1 ? "these" : "this"} as few-shot {totalCorrections !== 1 ? "examples" : "example"}.
              </p>
              <button
                onClick={runReextract}
                disabled={rerunLoading}
                className="btn-primary w-full"
                style={{ fontSize: 16, marginTop: 8 }}
              >
                {rerunLoading ? "running..." : "Re-run with corrections"}
              </button>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 10 }}>
                Hint: correct the &ldquo;handwritten check&rdquo; sender field to see the canned demo.
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
              Edit any field above to unlock the re-run.
            </p>
          )}
        </div>
      </FadeSection>

      {/* ── DELTA PANEL ──────────────────────────────────────── */}
      {rerunResults && (
        <FadeSection
          className="mx-auto w-full scroll-mt-20 px-4 sm:px-6"
          style={{ maxWidth: 1000, paddingBottom: "clamp(2rem,5vh,4rem)" }}
        >
          <div ref={deltaRef} />
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="section-title">What changed</h2>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {rerunFromCache ? "canned demo · cached" : "live re-extraction"} · ref #{receiptId}
            </span>
          </div>

          {/* Headline summary card */}
          {haiku && afterAutoRate !== null && (
            <div
              className="receipt-reveal glass mb-4"
              style={{ borderRadius: 20, overflow: "hidden" }}
            >
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid var(--hairline)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {totalCorrections} correction · {afterAutoRate !== haiku.autoRate ? "1 fewer manual review" : "queue unchanged"} · auto rate{" "}
                <span style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 13 }}>
                  {pct(haiku.autoRate)} → {pct(afterAutoRate)}
                </span>{" "}
                · safe routing{" "}
                <span style={{ color: "var(--green-text)", fontWeight: 600 }}>{pct(haiku.routingSafe)}</span>
              </div>
              <div className="grid grid-cols-3">
                {[
                  { label: "auto-route", before: pct(haiku.autoRate), after: pct(afterAutoRate), changed: afterAutoRate !== haiku.autoRate },
                  { label: "safe routing", before: pct(haiku.routingSafe), after: pct(haiku.routingSafe), changed: false },
                  { label: "corrections", before: null, after: String(totalCorrections), changed: false },
                ].map((stat, i) => (
                  <div
                    key={i}
                    className="delta-in px-4 py-4 text-center"
                    style={{
                      animationDelay: `${i * 80}ms`,
                      borderRight: i < 2 ? "1px solid var(--hairline)" : undefined,
                    }}
                  >
                    <p className="micro-label mb-2" style={{ fontSize: 10 }}>{stat.label}</p>
                    {stat.before !== null && (
                      <p
                        style={{
                          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                          fontSize: 12,
                          color: "var(--text-tertiary)",
                          textDecoration: "line-through",
                        }}
                      >
                        {stat.before}
                      </p>
                    )}
                    <p
                      style={{
                        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                        fontSize: 22,
                        fontWeight: 700,
                        color: stat.changed ? "var(--green-text)" : "var(--text-primary)",
                        lineHeight: 1.2,
                      }}
                    >
                      {stat.after}
                      {stat.changed && (
                        <span style={{ fontSize: 14, color: "var(--green)", marginLeft: 4 }}>↑</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-doc rows */}
          <div className="receipt-reveal glass" style={{ borderRadius: 20, overflow: "hidden" }}>
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
                  className="delta-in px-5 py-4"
                  style={{
                    animationDelay: `${i * 80}ms`,
                    borderBottom: i < rerunResults.length - 1 ? "1px solid var(--hairline)" : undefined,
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                      {sample?.label ?? r.sampleId}
                    </p>
                    {improved && (
                      <span
                        className="pill-spring inline-flex items-center gap-1.5 rounded-full px-3 py-1"
                        style={{
                          background: "var(--green-bg)",
                          color: "var(--green-text)",
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
                        now auto-routed
                      </span>
                    )}
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <p className="micro-label mb-1" style={{ fontSize: 10 }}>before</p>
                      <p
                        style={{
                          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                          fontSize: 13,
                          color: "var(--text-secondary)",
                        }}
                      >
                        {Math.round(r.before.overallConfidence * 100)}% · {routeBefore}
                      </p>
                    </div>
                    <div>
                      <p className="micro-label mb-1" style={{ fontSize: 10 }}>after</p>
                      <p
                        style={{
                          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                          fontSize: 13,
                          color: confDelta > 0 ? "var(--green-text)" : "var(--text-primary)",
                          fontWeight: confDelta > 0 ? 600 : 400,
                        }}
                      >
                        {Math.round(r.after.overallConfidence * 100)}%
                        {confDelta !== 0 && (
                          <span style={{ fontSize: 11, marginLeft: 4, color: "var(--green)" }}>
                            ({confDelta > 0 ? "+" : ""}{Math.round(confDelta * 100)}pt)
                          </span>
                        )}{" "}
                        · {routeAfter}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Explanatory prose */}
            <div
              style={{
                padding: "20px 20px",
                borderTop: "1px solid var(--hairline)",
                background: "rgba(0,0,0,0.015)",
              }}
            >
              <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
                The correction told the model: on this batch, the sender field of a handwritten check is the check writer, not the drawee bank. The model applied that to the next ambiguous document, raising confidence on the utility bill enough to clear the routing bar. One human correction, one less item in the queue.
              </p>
            </div>
          </div>
        </FadeSection>
      )}

      {/* ═══════════════════════════════════════════════════════
          STEP 4 — PROOF (eval)
      ═══════════════════════════════════════════════════════ */}
      <FadeSection
        id="eval"
        className="mx-auto w-full scroll-mt-20 px-4 sm:px-6"
        style={{ maxWidth: 1000, paddingBottom: "clamp(4rem,8vh,6rem)" }}
      >
        <p className="micro-label mb-3">step 4 · it&apos;s measured</p>
        <h2 className="section-title mb-6">Proof</h2>

        {/* Stat trio — always 3-up */}
        <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-4">
          <StatCard
            big={haiku ? `${routingSafeCount}%` : "—"}
            label="safe routing"
          />
          <StatCard
            big={haiku ? `$${haiku.costPerDocUsd.toFixed(3)}` : "—"}
            label="per doc"
          />
          <StatCard
            big={haiku ? `${latencyCount}s` : "—"}
            label="latency"
          />
        </div>

        {/* Comparison table */}
        <div
          className="glass mb-6"
          style={{ borderRadius: 20, overflow: "hidden" }}
        >
          {/* Scrollable wrapper inside card only */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 560, fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--hairline)" }}>
                  {["model", "type", "sender", "amount", "deadline", "action", "safe", "auto", "latency", "cost"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "12px 14px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: h === "safe" ? "var(--green-text)" : "var(--text-tertiary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evalStats.map((s, i) => (
                  <tr
                    key={s.model}
                    style={{
                      borderBottom: i < evalStats.length - 1 ? "1px solid var(--hairline)" : undefined,
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 14px",
                        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.model.replace("claude-", "")}
                    </td>
                    {[pct(s.docType), pct(s.sender), pct(s.amount), pct(s.keyDate), pct(s.action)].map((v, vi) => (
                      <td
                        key={vi}
                        style={{
                          padding: "12px 14px",
                          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                          fontSize: 13,
                          color: "var(--text-primary)",
                        }}
                      >
                        {v}
                      </td>
                    ))}
                    <td
                      style={{
                        padding: "12px 14px",
                        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--green-text)",
                      }}
                    >
                      {pct(s.routingSafe)}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                        fontSize: 13,
                        color: "var(--text-primary)",
                      }}
                    >
                      {pct(s.autoRate)}
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                        fontSize: 13,
                        color: "var(--text-primary)",
                      }}
                    >
                      {(s.meanLatencyMs / 1000).toFixed(1)}s
                    </td>
                    <td
                      style={{
                        padding: "12px 14px",
                        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                        fontSize: 13,
                        color: "var(--text-primary)",
                      }}
                    >
                      ${s.costPerDocUsd.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Honest prose */}
          <div style={{ padding: "20px 20px", borderTop: "1px solid var(--hairline)", background: "rgba(0,0,0,0.015)" }}>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              What the eval changed
            </p>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                lineHeight: 1.7,
                maxWidth: "65ch",
                marginBottom: 16,
              }}
            >
              First pass auto-routed a wrongly-actioned utility bill at 0.88 confidence. Raising the bar to 0.90 traded roughly 20 points of automation for 100% safe routing. You only get to make that trade on purpose when you measure.
            </p>
            <p
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              What the reviewer changed
            </p>
            <p
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                lineHeight: 1.7,
                maxWidth: "65ch",
              }}
            >
              Correcting one field on a handwritten check propagated as a few-shot exemplar to the re-extraction pass. The model updated its interpretation of &ldquo;sender&rdquo; for the ambiguous utility bill and cleared the confidence bar without any prompt editing.
            </p>
          </div>
        </div>
      </FadeSection>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid var(--glass-border)",
          padding: "20px 24px",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          Built by{" "}
          <a
            href="https://mikebatts.net"
            style={{ color: "var(--accent)", fontWeight: 500 }}
          >
            Mike Battaglia
          </a>{" "}
          for the team at Stable. Not affiliated. Synthetic mail only.{" "}
          <a
            href="https://github.com/mikebatts/mailroom-intelligence"
            style={{ color: "var(--accent)", fontWeight: 500 }}
          >
            github
          </a>
        </p>
      </footer>
    </div>
  );
}
