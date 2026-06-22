import { NextResponse } from "next/server";
import { runProbesForAllSites } from "@/lib/probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const out = await runProbesForAllSites();
  return NextResponse.json({ ok: true, ...out });
}

export const GET = POST;
