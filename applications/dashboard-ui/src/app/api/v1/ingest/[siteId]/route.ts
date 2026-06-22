import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { getSiteByIdAny } from "@/lib/db/repo/sites";
import { verifyKey } from "@/lib/db/repo/keys";
import { insertEvent } from "@/lib/db/repo/events";
import { enrich } from "@/lib/enrich";
import { evaluate, applyResults } from "@/lib/rules/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  source:      z.string().min(1).max(64).optional(),
  src_ip:      z.string().max(64).nullable().optional(),
  src_country: z.string().max(4).nullable().optional(),
  method:      z.string().max(16).nullable().optional(),
  path:        z.string().max(2048).nullable().optional(),
  status_code: z.number().int().min(0).max(999).nullable().optional(),
  user_agent:  z.string().max(2048).nullable().optional(),
  raw:         z.unknown().optional(),
});

// in-memory token bucket per site (resets per-process)
const buckets = new Map<string, { tokens: number; refilledAt: number }>();
const RATE  = 200;       // tokens per second
const BURST = 1000;
function take(siteId: string): boolean {
  const now = Date.now();
  const b = buckets.get(siteId) ?? { tokens: BURST, refilledAt: now };
  const refill = ((now - b.refilledAt) / 1000) * RATE;
  b.tokens = Math.min(BURST, b.tokens + refill);
  b.refilledAt = now;
  if (b.tokens < 1) { buckets.set(siteId, b); return false; }
  b.tokens -= 1;
  buckets.set(siteId, b);
  return true;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await ctx.params;

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return NextResponse.json({ error: "missing bearer token" }, { status: 401 });

  const site = getSiteByIdAny(siteId);
  if (!site) return NextResponse.json({ error: "site not found" }, { status: 404 });

  const key = verifyKey(siteId, token);
  if (!key) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  if (!take(siteId)) return NextResponse.json({ error: "rate limit" }, { status: 429 });

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "schema", details: parsed.error.flatten() }, { status: 400 });
  }

  const enriched = await enrich(parsed.data);

  const id = nanoid();
  const inserted = insertEvent({
    id, siteId, ...enriched, ingestedAt: new Date(),
  });

  // Rule engine — async fire-and-forget so the response stays fast
  evaluate(site, enriched).then((results) => applyResults(site, results)).catch((e) => console.error("[rules]", e));

  return NextResponse.json({ ok: true, id: inserted.id, threat_score: inserted.threatScore }, { status: 202 });
}
