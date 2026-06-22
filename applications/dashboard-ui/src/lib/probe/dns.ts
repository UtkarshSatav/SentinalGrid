import "server-only";
import { Resolver } from "node:dns/promises";
import type { NewProbe } from "@/lib/db/schema";

const TIMEOUT_MS = 4000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((res) => setTimeout(() => res(null), ms)),
  ]);
}

export async function probeDns(siteId: string, hostname: string): Promise<NewProbe> {
  const start = Date.now();
  const resolver = new Resolver();
  try {
    const [a, aaaa, mx, ns] = await Promise.all([
      withTimeout(resolver.resolve4(hostname).catch(() => []), TIMEOUT_MS),
      withTimeout(resolver.resolve6(hostname).catch(() => []), TIMEOUT_MS),
      withTimeout(resolver.resolveMx(hostname).catch(() => []), TIMEOUT_MS),
      withTimeout(resolver.resolveNs(hostname).catch(() => []), TIMEOUT_MS),
    ]);
    const status = (a && a.length > 0) ? "healthy" : "failed";
    return {
      siteId, kind: "dns", status,
      latencyMs: Date.now() - start,
      details: { a: a ?? [], aaaa: aaaa ?? [], mx: mx ?? [], ns: ns ?? [] },
      observedAt: new Date(),
    };
  } catch (err) {
    return {
      siteId, kind: "dns", status: "failed",
      latencyMs: Date.now() - start,
      details: { error: String(err instanceof Error ? err.message : err) },
      observedAt: new Date(),
    };
  }
}
