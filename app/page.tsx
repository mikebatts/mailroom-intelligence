"use client";

import { useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import ExtractionPanel from "@/components/ExtractionPanel";
import EvalTable from "@/components/EvalTable";
import UploadDrop from "@/components/UploadDrop";
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

type Tab = "inbox" | "review" | "eval" | "try";
type EvalStats = Parameters<typeof EvalTable>[0]["stats"];

export default function Page() {
  const [samples, setSamples] = useState<MailSample[]>([]);
  const [records, setRecords] = useState<ExtractionRecord[]>([]);
  const [evalStats, setEvalStats] = useState<EvalStats>([]);
  const [model, setModel] = useState("claude-haiku-4-5");
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("inbox");
  const [loading, setLoading] = useState(true);
  const [decisions, setDecisions] = useState<Record<string, "approved" | "corrected">>({});

  // Deep-linkable tabs: /#eval, /#review, /#try
  const openTab = (t: Tab) => {
    setTab(t);
    window.history.replaceState(null, "", t === "inbox" ? window.location.pathname : `#${t}`);
  };

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
        setSelected(data.samples[0]?.id ?? null);
        const fromHash = window.location.hash.replace("#", "");
        if (["review", "eval", "try"].includes(fromHash)) setTab(fromHash as Tab);
      })
      .finally(() => setLoading(false));
  }, []);

  const models = useMemo(() => [...new Set(records.map((r) => r.model))], [records]);
  const byId = useMemo(() => {
    const m = new Map<string, ExtractionRecord>();
    for (const r of records) if (r.model === model) m.set(r.sampleId, r);
    return m;
  }, [records, model]);

  const reviewItems = useMemo(
    () =>
      samples.filter((s) => {
        const r = byId.get(s.id);
        return r && routeExtraction(r.extraction as Extraction).route === "review";
      }),
    [samples, byId]
  );

  const current = selected ? byId.get(selected) : undefined;
  const currentSample = samples.find((s) => s.id === selected);

  const tabs: { id: Tab; label: string }[] = [
    { id: "inbox", label: "Inbox" },
    { id: "review", label: `Review queue (${reviewItems.length})` },
    { id: "eval", label: "Eval" },
    { id: "try", label: "Try your own" },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-1 rounded-lg bg-dark/5 p-1" aria-label="Sections">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => openTab(t.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                  tab === t.id ? "bg-white shadow-sm" : "text-secondary hover:text-dark"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {(tab === "inbox" || tab === "review") && models.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-secondary">
              Model
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-md border border-dark/15 bg-white px-2 py-1.5 text-sm font-medium text-dark"
              >
                {models.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-xl bg-dark/5" />
            ))}
          </div>
        )}

        {!loading && tab === "inbox" && (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div className="grid content-start gap-3 sm:grid-cols-2">
              {samples.map((s) => {
                const r = byId.get(s.id);
                const route = r ? routeExtraction(r.extraction as Extraction).route : null;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                    className={`group overflow-hidden rounded-xl border bg-white text-left transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
                      selected === s.id ? "border-primary ring-1 ring-primary" : "border-dark/10"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.file} alt={s.label} className="h-28 w-full border-b border-dark/5 object-cover object-center" />
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="text-sm font-medium">{s.label}</span>
                      {route && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            route === "auto" ? "bg-success/40" : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {route === "auto" ? "auto" : "review"}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="lg:sticky lg:top-6 lg:self-start">
              {current && currentSample ? (
                <div className="flex flex-col gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentSample.file}
                    alt={currentSample.label}
                    className="max-h-72 w-full rounded-xl border border-dark/10 bg-white object-contain"
                  />
                  <ExtractionPanel
                    extraction={current.extraction as Extraction}
                    meta={{ model: current.model, latencyMs: current.latencyMs, costUsd: current.costUsd }}
                  />
                </div>
              ) : (
                <p className="text-sm text-secondary">Select a piece of mail.</p>
              )}
            </div>
          </div>
        )}

        {!loading && tab === "review" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-secondary">
              Everything here either fell under the {Math.round(CONFIDENCE_THRESHOLD * 100)}% confidence bar or
              belongs to a high-stakes class (legal, government) that always gets human eyes. One click clears
              an item; in a real system the correction feeds the next eval round.
            </p>
            {reviewItems.length === 0 && <p className="text-sm text-secondary">Queue is clear.</p>}
            {reviewItems.map((s) => {
              const r = byId.get(s.id)!;
              const decided = decisions[`${model}:${s.id}`];
              return (
                <div key={s.id} className="grid gap-4 rounded-xl border border-dark/10 bg-white p-4 md:grid-cols-[200px_1fr_auto]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.file} alt={s.label} className="h-32 w-full rounded-lg border border-dark/5 object-cover object-center" />
                  <div>
                    <p className="text-sm font-semibold">{s.label}</p>
                    <p className="mt-1 text-sm text-secondary">{(r.extraction as Extraction).summary}</p>
                    <p className="mt-2 text-xs text-secondary">
                      {routeExtraction(r.extraction as Extraction).reason} · confidence{" "}
                      {Math.round((r.extraction as Extraction).overallConfidence * 100)}%
                    </p>
                  </div>
                  <div className="flex items-start gap-2 md:flex-col">
                    {decided ? (
                      <span
                        className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                          decided === "approved" ? "bg-success/40" : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {decided === "approved" ? "Approved" : "Corrected"}
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => setDecisions((d) => ({ ...d, [`${model}:${s.id}`]: "approved" }))}
                          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setDecisions((d) => ({ ...d, [`${model}:${s.id}`]: "corrected" }))}
                          className="rounded-lg border border-dark/15 px-3 py-1.5 text-sm font-medium hover:bg-dark/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        >
                          Correct
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === "eval" && <EvalTable stats={evalStats} />}

        {!loading && tab === "try" && <UploadDrop />}
      </main>
      <footer className="border-t border-dark/10 bg-white">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-secondary sm:px-6">
          A demo by <a className="font-medium text-primary hover:underline" href="https://mikebatts.net">Mike Battaglia</a> for
          the team at Stable. Not affiliated with Stable; all mail pieces are synthetic. Stack: Next.js,
          TypeScript, GraphQL (Yoga), Claude vision models, Tailwind.
        </p>
      </footer>
    </div>
  );
}
