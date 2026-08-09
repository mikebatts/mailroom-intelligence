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

const MODEL = "claude-haiku-4-5";
const pct = (x: number) => `${Math.round(x * 100)}%`;

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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => {
    const m = new Map<string, ExtractionRecord>();
    for (const r of records) if (r.model === MODEL) m.set(r.sampleId, r);
    return m;
  }, [records]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

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
    timers.current.push(setTimeout(() => setPhase("route"), 2050));
    timers.current.push(setTimeout(() => setPhase("done"), 2600));
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
        if (first) {
          // let the page paint, then run the show
          timers.current.push(setTimeout(() => play(first), 450));
        }
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
          timers.current.push(setTimeout(() => setPhase("done"), 1450));
        }, wait)
      );
    } catch (err) {
      setPhase("idle");
      setLiveError((err as Error).message);
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

  return (
    <div
      className="flex min-h-screen flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.relatedTarget === null) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && f.type.startsWith("image/")) handleUpload(f);
      }}
    >
      {/* drop overlay */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-[2px]">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-light px-8 py-6 text-center">
            <p className="text-lg font-semibold text-primary">Drop it in the mailroom</p>
            <p className="mt-1 text-sm text-secondary">PNG or JPEG, we&apos;ll take it from here</p>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
              <rect width="64" height="64" rx="14" fill="#3066BE" />
              <path d="M14 22l18 13 18-13" fill="none" stroke="#FAFCFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="14" y="20" width="36" height="26" rx="4" fill="none" stroke="#FAFCFF" strokeWidth="5" />
            </svg>
            <span className="text-[15px] font-bold tracking-tight">Mailroom Intelligence</span>
          </div>
          <nav className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-widest text-secondary">
            <a href="#review" className="transition-colors hover:text-primary">
              Review<span className="hidden sm:inline"> queue</span>
              {reviewItems.length > 0 && <span className="ml-1 text-amber-600">{reviewItems.length}</span>}
            </a>
            <a href="#eval" className="transition-colors hover:text-primary">Eval</a>
            <a href="https://github.com/mikebatts/mailroom-intelligence" target="_blank" rel="noreferrer" className="hidden transition-colors hover:text-primary sm:inline">Code</a>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        {/* hero: the stage */}
        <section className="pb-2 pt-5 sm:pt-12">
          <h1 className="text-balance text-xl font-bold tracking-tight sm:text-[28px]">
            Mail goes in. <span className="text-primary">Decisions come out.</span>
          </h1>
          <p className="mt-1.5 text-[13px] text-secondary sm:text-[15px]">
            AI triage for physical mail: reads every piece, routes the confident calls, flags the rest for a human.
          </p>
          <div ref={stageRef} className="mt-5 scroll-mt-16 sm:mt-7">
            <Stage
              image={stageImage}
              label={stageLabel}
              extraction={stageExtraction}
              phase={phase}
              meta={stageMeta}
              live={!!liveResult}
            />
            {liveError && (
              <p className="mt-3 rounded-lg bg-danger/10 px-4 py-2.5 text-sm text-danger">{liveError}</p>
            )}
          </div>
        </section>

        {/* filmstrip */}
        <section className="pb-12 pt-6">
          <div className="filmstrip -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
            <button
              onClick={() => inputRef.current?.click()}
              className="flex h-20 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-white/60 text-primary transition-colors hover:border-primary hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="text-xl leading-none">+</span>
              <span className="font-mono text-[9px] uppercase tracking-widest">your mail</span>
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
                  className={`group relative h-20 w-24 shrink-0 overflow-hidden rounded-xl border bg-white transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                    active ? "border-primary shadow-md ring-1 ring-primary" : "border-ink/10 hover:shadow-md"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.file} alt={s.label} loading="lazy" className="h-full w-full object-cover object-center" />
                  {route === "review" && (
                    <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" title="needs review" />
                  )}
                </button>
              );
            })}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </section>

        {/* review queue */}
        <section id="review" className="scroll-mt-16 border-t border-ink/10 py-12">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-lg font-bold tracking-tight">Review queue</h2>
            <span className="font-mono text-[11px] uppercase tracking-widest text-secondary">
              under {Math.round(CONFIDENCE_THRESHOLD * 100)}% confidence, or high-stakes
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {reviewItems.map((s, i) => {
              const r = byId.get(s.id)!;
              const e = r.extraction as Extraction;
              const decided = decisions[s.id];
              return (
                <div key={s.id} className="tray-in paper-card flex gap-3.5 rounded-2xl p-3.5" style={{ animationDelay: `${i * 70}ms` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.file} alt={s.label} loading="lazy" className="h-20 w-24 shrink-0 rounded-lg border border-ink/5 object-cover object-center" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{s.label}</p>
                      <span className="shrink-0 font-mono text-[10px] text-secondary">{Math.round(e.overallConfidence * 100)}%</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-secondary">{e.summary}</p>
                    <div className="mt-2 flex gap-1.5">
                      {decided ? (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${decided === "approved" ? "bg-success/50" : "bg-amber-100 text-amber-900"}`}>
                          {decided === "approved" ? "✓ approved" : "✎ corrected"}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => setDecisions((d) => ({ ...d, [s.id]: "approved" }))}
                            className="rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-primary-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setDecisions((d) => ({ ...d, [s.id]: "corrected" }))}
                            className="rounded-full border border-ink/15 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-ink/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            Correct
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {reviewItems.length === 0 && <p className="text-sm text-secondary">Queue is clear.</p>}
          </div>
        </section>

        {/* eval */}
        <section id="eval" className="scroll-mt-16 border-t border-ink/10 py-12">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="text-lg font-bold tracking-tight">The eval</h2>
            <span className="font-mono text-[11px] uppercase tracking-widest text-secondary">
              {haiku?.n ?? 0} labeled samples · 2 models
            </span>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-3">
            {[
              { big: haiku ? pct(haiku.routingSafe) : "—", small: "safe routing" },
              { big: haiku ? `$${haiku.costPerDocUsd.toFixed(3)}` : "—", small: "per doc" },
              { big: haiku ? `${(haiku.meanLatencyMs / 1000).toFixed(1)}s` : "—", small: "latency" },
            ].map((s) => (
              <div key={s.small} className="paper-card rounded-2xl px-3 py-4 text-center sm:py-5">
                <p className="font-mono text-xl font-semibold text-primary sm:text-3xl">{s.big}</p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-widest text-secondary sm:text-[11px]">{s.small}</p>
              </div>
            ))}
          </div>

          <div className="paper-card overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-ink/10 text-left font-mono text-[10px] uppercase tracking-widest text-secondary">
                  <th className="px-4 py-3 font-medium">model</th>
                  <th className="px-3 py-3 font-medium">type</th>
                  <th className="px-3 py-3 font-medium">sender</th>
                  <th className="px-3 py-3 font-medium">amount</th>
                  <th className="px-3 py-3 font-medium">deadline</th>
                  <th className="px-3 py-3 font-medium">action</th>
                  <th className="px-3 py-3 font-medium text-primary">safe</th>
                  <th className="px-3 py-3 font-medium">auto</th>
                  <th className="px-3 py-3 font-medium">latency</th>
                  <th className="px-3 py-3 font-medium">cost</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {evalStats.map((s) => (
                  <tr key={s.model} className="border-b border-ink/5 last:border-0">
                    <td className="px-4 py-3 font-sans font-semibold">{s.model.replace("claude-", "")}</td>
                    <td className="px-3 py-3">{pct(s.docType)}</td>
                    <td className="px-3 py-3">{pct(s.sender)}</td>
                    <td className="px-3 py-3">{pct(s.amount)}</td>
                    <td className="px-3 py-3">{pct(s.keyDate)}</td>
                    <td className="px-3 py-3">{pct(s.action)}</td>
                    <td className="px-3 py-3 font-semibold text-primary">{pct(s.routingSafe)}</td>
                    <td className="px-3 py-3">{pct(s.autoRate)}</td>
                    <td className="px-3 py-3">{(s.meanLatencyMs / 1000).toFixed(1)}s</td>
                    <td className="px-3 py-3">${s.costPerDocUsd.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.04] px-4 py-3.5 sm:px-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">what the eval changed</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink/80 sm:text-sm">
              First pass auto-routed a wrongly-actioned utility bill at 0.88 confidence. Raising the bar to 0.90
              traded ~20 points of automation for 100% safe routing. You only get to make that trade on purpose
              when you measure.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/10 bg-white/60">
        <p className="mx-auto w-full max-w-5xl px-4 py-5 text-xs leading-relaxed text-secondary sm:px-6">
          Built by <a className="font-medium text-primary hover:underline" href="https://mikebatts.net">Mike Battaglia</a> for
          the team at Stable — not affiliated, all mail synthetic.{" "}
          <a className="text-primary hover:underline" href="https://github.com/mikebatts/mailroom-intelligence">Code on GitHub</a>. Next.js · TypeScript · GraphQL · Claude vision.
        </p>
      </footer>
    </div>
  );
}
