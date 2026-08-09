// Live extraction for uploaded mail images. Requires ANTHROPIC_API_KEY or
// OPENROUTER_API_KEY in the environment; without one, the demo runs on the
// precomputed sample results and this route returns 503.
import { NextRequest, NextResponse } from "next/server";
import { extractFromImage } from "@/lib/extract";

export const maxDuration = 30;

// Naive in-memory rate limit: fine for a demo, not for production.
const hits: number[] = [];
const LIMIT = 10; // per 5 minutes per instance

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "Live extraction is disabled on this deployment. Browse the sample gallery instead." },
      { status: 503 }
    );
  }

  const now = Date.now();
  while (hits.length && hits[0] < now - 5 * 60_000) hits.shift();
  if (hits.length >= LIMIT) {
    return NextResponse.json({ error: "Rate limit reached. Try again in a few minutes." }, { status: 429 });
  }
  hits.push(now);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach an image as 'file'." }, { status: 400 });
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    return NextResponse.json({ error: "PNG, JPEG, or WebP only." }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "5MB max." }, { status: 400 });
  }

  const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  try {
    const result = await extractFromImage(b64, file.type, "claude-haiku-4-5");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message.slice(0, 200) }, { status: 502 });
  }
}
