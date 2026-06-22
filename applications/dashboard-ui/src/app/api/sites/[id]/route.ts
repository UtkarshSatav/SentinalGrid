import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteSite, getSite, updateSite } from "@/lib/db/repo/sites";
import { latestProbesByKind, listProbes } from "@/lib/db/repo/probes";
import { listEvents } from "@/lib/db/repo/events";
import { getDemoOrgId } from "@/lib/db/repo/orgs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  slackWebhookUrl: z.string().url().or(z.literal("")).optional(),
  probeIntervalSec: z.number().int().min(30).max(3600).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = getSite(getDemoOrgId(), id);
  if (!site) return NextResponse.json({ error: "not found" }, { status: 404 });
  const latest = latestProbesByKind(id);
  const events = listEvents(id, 50);
  const probes = listProbes(id, 30);
  return NextResponse.json({ site, latest, events, probes });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const patch = { ...parsed.data, slackWebhookUrl: parsed.data.slackWebhookUrl === "" ? null : parsed.data.slackWebhookUrl };
  updateSite(id, patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deleteSite(id);
  return NextResponse.json({ ok: true });
}
