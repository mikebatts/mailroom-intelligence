"use client";

import { useRef, useState } from "react";
import type { Extraction } from "@/lib/types";
import ExtractionPanel from "./ExtractionPanel";

interface LiveResult {
  extraction: Extraction;
  latencyMs: number;
}

export default function UploadDrop() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          className={`flex min-h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${
            dragging ? "border-primary bg-primary/5" : "border-dark/20 bg-white hover:border-primary/60"
          }`}
        >
          <span className="text-3xl">📬</span>
          <span className="text-sm font-medium">Drop a scanned piece of mail here</span>
          <span className="text-xs text-secondary">PNG, JPEG, or WebP up to 5MB</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Uploaded mail" className="mt-4 w-full rounded-lg border border-dark/10" />
        )}
      </div>
      <div>
        {busy && (
          <div className="flex flex-col gap-3">
            <div className="h-10 animate-pulse rounded-lg bg-dark/5" />
            <div className="h-40 animate-pulse rounded-lg bg-dark/5" />
            <div className="h-8 w-48 animate-pulse rounded-full bg-dark/5" />
          </div>
        )}
        {error && (
          <p className="rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
        )}
        {result && (
          <ExtractionPanel
            extraction={result.extraction}
            meta={{ model: "claude-haiku-4-5", latencyMs: result.latencyMs, costUsd: 0.002 }}
          />
        )}
        {!busy && !error && !result && (
          <p className="text-sm text-secondary">
            Upload any mail-like image and the same pipeline that processed the gallery runs live: extraction,
            confidence scoring, and routing. On deployments without an API key this panel is disabled and the
            gallery runs on cached results.
          </p>
        )}
      </div>
    </div>
  );
}
