import "server-only";
import type { NewProbe } from "@/lib/db/schema";

const REQUIRED = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
] as const;

const TIMEOUT_MS = 8000;

function grade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  if (score >= 30) return "E";
  return "F";
}

export async function probeHeaders(siteId: string, url: string): Promise<NewProbe> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "SentinelGrid-Probe/1.0" },
    });
    clearTimeout(timer);

    const present: Record<string, string | null> = {};
    for (const h of REQUIRED) present[h] = res.headers.get(h);
    const found = REQUIRED.filter((h) => present[h]).length;
    const score = Math.round((found / REQUIRED.length) * 100);
    const letterGrade = grade(score);
    const status = score >= 75 ? "healthy" : score >= 45 ? "degraded" : "failed";

    return {
      siteId, kind: "headers", status,
      latencyMs: Date.now() - start,
      statusCode: res.status,
      details: {
        score,
        grade: letterGrade,
        present,
        missing: REQUIRED.filter((h) => !present[h]),
      },
      observedAt: new Date(),
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      siteId, kind: "headers", status: "failed",
      latencyMs: Date.now() - start,
      details: { error: String(err instanceof Error ? err.message : err) },
      observedAt: new Date(),
    };
  }
}
