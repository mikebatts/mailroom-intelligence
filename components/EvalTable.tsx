"use client";

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

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function EvalTable({ stats }: { stats: ModelStats[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border border-dark/10 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-dark/10 text-left text-xs uppercase tracking-wide text-secondary">
              <th className="px-4 py-3">Model</th>
              <th className="px-3 py-3">Doc type</th>
              <th className="px-3 py-3">Sender</th>
              <th className="px-3 py-3">Amount</th>
              <th className="px-3 py-3">Deadline</th>
              <th className="px-3 py-3">Action</th>
              <th className="px-3 py-3">Safe routing</th>
              <th className="px-3 py-3">Auto rate</th>
              <th className="px-3 py-3">Latency</th>
              <th className="px-3 py-3">Cost/doc</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.model} className="border-b border-dark/5 last:border-0">
                <td className="px-4 py-3 font-medium">{s.model}</td>
                <td className="px-3 py-3 tabular-nums">{pct(s.docType)}</td>
                <td className="px-3 py-3 tabular-nums">{pct(s.sender)}</td>
                <td className="px-3 py-3 tabular-nums">{pct(s.amount)}</td>
                <td className="px-3 py-3 tabular-nums">{pct(s.keyDate)}</td>
                <td className="px-3 py-3 tabular-nums">{pct(s.action)}</td>
                <td className="px-3 py-3 font-semibold tabular-nums text-primary">{pct(s.routingSafe)}</td>
                <td className="px-3 py-3 tabular-nums">{pct(s.autoRate)}</td>
                <td className="px-3 py-3 tabular-nums">{(s.meanLatencyMs / 1000).toFixed(1)}s</td>
                <td className="px-3 py-3 tabular-nums">${s.costPerDocUsd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="rounded-lg bg-primary/5 px-4 py-3 text-sm leading-relaxed">
        <p className="font-semibold">What the eval changed</p>
        <p className="mt-1 text-secondary">
          The first pass auto-routed a utility bill with the wrong action at 0.88 confidence. Raising the
          auto-route threshold from 0.85 to 0.90 traded ~20 points of automation rate for 100% safe routing on
          this set. That tradeoff is the product decision, and without an eval you never get to make it on
          purpose. Scored on {stats[0]?.n ?? 0} labeled synthetic samples; safe routing means an item is never
          auto-actioned while a core field (type, amount, action) is wrong.
        </p>
      </div>
    </div>
  );
}
