import { NextResponse } from "next/server";
import { issueKey, listKeys, revokeKey } from "@/lib/db/repo/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return NextResponse.json({ keys: listKeys(id) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const label = typeof body?.label === "string" ? body.label : "default";
  const key = issueKey(id, label);
  return NextResponse.json(key, { status: 201 });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const keyId = url.searchParams.get("keyId");
  if (!keyId) return NextResponse.json({ error: "missing keyId" }, { status: 400 });
  revokeKey(keyId);
  return NextResponse.json({ ok: true });
}
