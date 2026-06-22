import { NextResponse } from "next/server";
import { getSiteByIdAny } from "@/lib/db/repo/sites";
import { runAllProbesForSite } from "@/lib/probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = getSiteByIdAny(id);
  if (!site) return NextResponse.json({ error: "not found" }, { status: 404 });
  await runAllProbesForSite(site);
  return NextResponse.json({ ok: true });
}
