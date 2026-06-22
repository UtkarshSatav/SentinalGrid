import { NextResponse } from "next/server";
import { getSiteByIdAny } from "@/lib/db/repo/sites";
import { issueKey } from "@/lib/db/repo/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATTACKER_IPS = ["91.234.99.12", "185.220.101.45", "194.5.99.10", "193.42.55.7", "45.155.205.14"];
const UAS = [
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 sqlmap/1.7",
  "Mozilla/5.0 (compatible; Nikto/2.5.0)",
  "curl/7.88.1",
  "python-requests/2.31.0",
  "Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36",
];
const PAYLOADS = [
  "/login",
  "/login?next=' OR 1=1--",
  "/wp-admin/admin-ajax.php",
  "/api/v1/users?id=1' UNION SELECT password FROM users--",
  "/../../../../etc/passwd",
  "/login",
];

function pick<T>(a: T[]) { return a[Math.floor(Math.random() * a.length)]; }

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const site = getSiteByIdAny(id);
  if (!site) return NextResponse.json({ error: "site not found" }, { status: 404 });

  const url = new URL(req.url);
  const count = Math.min(parseInt(url.searchParams.get("count") ?? "60", 10), 200);

  // mint a throwaway key just for this demo so we hit the real ingest path
  const key = issueKey(id, "simulator");

  const base = url.origin;
  const ip = pick(ATTACKER_IPS);
  let ok = 0;
  await Promise.all(Array.from({ length: count }).map(async (_, i) => {
    const body = {
      source: "access_log",
      src_ip: ip,
      method: "POST",
      path: pick(PAYLOADS),
      status_code: i === 0 ? 200 : pick([401, 401, 401, 403, 401]),
      user_agent: pick(UAS),
    };
    const res = await fetch(`${base}/api/v1/ingest/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": `Bearer ${key.secret}` },
      body: JSON.stringify(body),
    });
    if (res.ok) ok++;
  }));

  return NextResponse.json({ ok: true, sent: count, accepted: ok });
}
