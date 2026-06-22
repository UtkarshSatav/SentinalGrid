import { NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { createSite, listSites } from "@/lib/db/repo/sites";
import { issueKey } from "@/lib/db/repo/keys";
import { getDemoOrgId } from "@/lib/db/repo/orgs";
import { runAllProbesForSite } from "@/lib/probe";
import { getSiteByIdAny } from "@/lib/db/repo/sites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(128).optional(),
  slackWebhookUrl: z.string().url().optional(),
});

export async function GET() {
  const orgId = getDemoOrgId();
  return NextResponse.json({ sites: listSites(orgId) });
}

export async function POST(req: Request) {
  const orgId = getDemoOrgId();
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const u = new URL(parsed.data.url);
  if (["localhost", "127.0.0.1", "::1"].includes(u.hostname) || u.hostname.endsWith(".local")) {
    return NextResponse.json({ error: "loopback/private addresses are not allowed" }, { status: 400 });
  }

  const id = nanoid();
  createSite({
    id, orgId,
    name: parsed.data.name ?? u.hostname,
    url: parsed.data.url,
    hostname: u.hostname,
    probeIntervalSec: 60,
    enabled: true,
    slackWebhookUrl: parsed.data.slackWebhookUrl ?? null,
  });

  const key = issueKey(id, "default");

  // Fire a first probe in the background so the user sees data fast.
  const site = getSiteByIdAny(id)!;
  runAllProbesForSite(site).catch((e) => console.error("[probe]", e));

  return NextResponse.json({ id, key: key.secret, key_prefix: key.prefix }, { status: 201 });
}
