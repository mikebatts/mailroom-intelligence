# Mailroom Intelligence

A working demo of AI mail triage, built for the team at Stable by [Mike Battaglia](https://mikebatts.net). **Live at [mailroom-intelligence.vercel.app](https://mailroom-intelligence.vercel.app).**

![Mailroom Intelligence](docs/screenshot.png)

Scanned mail goes in. A vision model extracts who sent it, who it's for, amounts, deadlines, and urgency, each with its own confidence score. A routing policy then decides: auto-action it (deposit, scan, forward, shred) or send it to a human review queue. The whole loop is measured by an eval harness, because an AI pipeline without an eval is a demo, and with one it's a system.

Not affiliated with Stable. Every mail piece is synthetic, rendered from HTML.

## The eval

Two models, same prompt, same 10 labeled samples:

| Model | Doc type | Sender | Amount | Deadline | Action | Safe routing | Auto rate | Latency | Cost/doc |
|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-4-5 | 100% | 90% | 100% | 100% | 100% | **100%** | 50% | 2.4s | $0.0019 |
| claude-sonnet-4-6 | 100% | 100% | 100% | 100% | 100% | **100%** | 70% | 5.2s | $0.0064 |

Safe routing = an item is never auto-actioned while a core field (type, amount, action) is wrong.

### What the eval changed

The first pass auto-routed a utility bill with the wrong action at 0.88 confidence. That's the failure mode that matters in a mailroom: not a wrong answer, a wrong answer acted on. Raising the auto-route threshold from 0.85 to 0.90 traded about 20 points of automation rate for 100% safe routing on this set. Small sample, honest tradeoff, and exactly the kind of decision you can only make on purpose when you measure.

Two policy decisions live in code, not in the prompt: high-stakes classes (legal service, government notices) always get human eyes regardless of confidence, and overall confidence is weighted toward the weakest field, so one illegible line sinks the score.

## What the reviewer changed

After the initial pass, five items land in the review queue: the handwritten check, the utility bill, the IRS notice, the DE franchise notice, and the service-of-process summons. The last three are always-review (high-stakes doc class). The first two are there on confidence grounds — the handwritten check at 0.88 and the utility bill at 0.89, both just under the 0.90 routing bar.

The reviewer opens the handwritten check and corrects one field: the model read the sender as "Coastal Credit Union" (the drawee bank printed on the bottom of the check) when the actual sender is "R. Delgado" (the check writer). That single correction becomes a few-shot exemplar injected into the prompt for the remaining docs.

Re-run on the utility bill: confidence 0.89 → 0.92. That's enough to clear the bar. The bill moves from review to auto-route.

| | Before | After |
|---|---|---|
| Auto-route rate | 50% | 60% |
| Safe routing | 100% | 100% |
| Queue size | 5 items | 4 items |
| Corrections applied | 0 | 1 |

Safe routing stays at 100% — the confidence gain on the utility bill is real, not inflated. The doc is a straightforward printed bill with legible amounts and dates; the prior uncertainty came from urgency ambiguity, which the exemplar helped resolve by analogy.

The mechanism is standard few-shot prompting — no fine-tuning, no model update, no retraining cost. The reviewer's correction is appended to the system prompt as a grounded example before the next extraction call. It works because the model already knows how to read mail; it just needed one concrete correction to break the tie on an ambiguous field.

The canned demo ships with a precomputed cache (`data/correction-demo.json`) so the loop works for keyless viewers. With a real API key the re-extraction runs live and uses whatever corrections the reviewer actually made.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- GraphQL endpoint (Yoga) serving samples, extractions, and eval stats
- Claude vision models for extraction, provider-flexible (direct Anthropic API or OpenRouter)
- Synthetic mail rendered from HTML via headless Chrome, so the dataset is reproducible and private-data-free

## Run it

```bash
npm install
npm run dev            # uses cached extractions, no API key needed
```

Regenerate everything:

```bash
npm run render:samples # re-render the synthetic mail set
ANTHROPIC_API_KEY=... npm run precompute  # or OPENROUTER_API_KEY=...
npm run eval           # score against data/groundtruth.json, prints the table above
```

The deployed gallery runs entirely on cached results (zero inference cost). The "Try your own" upload calls the pipeline live when an API key is present in the environment, with basic rate limiting.
