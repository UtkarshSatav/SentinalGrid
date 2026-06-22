import "server-only";
import type { NewProbe } from "@/lib/db/schema";

const TIMEOUT_MS = 8000;

export async function probeHttp(siteId: string, url: string): Promise<NewProbe> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "user-agent": "SentinelGrid-Probe/1.0 (+https://sentinelgrid.io)" },
    });
    clearTimeout(timer);
    const latency = Date.now() - start;
    const code = res.status;
    const status =
      code >= 200 && code < 400 ? "healthy" :
      code >= 400 && code < 500 ? "degraded" :
                                  "failed";
    return {
      siteId, kind: "http", status,
      latencyMs: latency, statusCode: code,
      details: {
        location: res.headers.get("location"),
        server:   res.headers.get("server"),
        contentType: res.headers.get("content-type"),
      },
      observedAt: new Date(),
    };
  } catch (err) {
    clearTimeout(timer);
    const latency = Date.now() - start;
    return {
      siteId, kind: "http", status: "failed",
      latencyMs: latency,
      details: { error: String(err instanceof Error ? err.message : err) },
      observedAt: new Date(),
    };
  }
}
