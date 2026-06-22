import "server-only";
import { insertProbe } from "@/lib/db/repo/probes";
import { recordProbeStatus, listSites } from "@/lib/db/repo/sites";
import { getDemoOrgId } from "@/lib/db/repo/orgs";
import type { Site } from "@/lib/db/schema";
import { probeHttp } from "./http";
import { probeTls } from "./tls";
import { probeHeaders } from "./headers";
import { probeDns } from "./dns";

function rollup(statuses: string[]): "healthy" | "degraded" | "failed" {
  if (statuses.includes("failed"))   return "failed";
  if (statuses.includes("degraded")) return "degraded";
  return "healthy";
}

export async function runAllProbesForSite(site: Site): Promise<void> {
  const [http, tls, headers, dns] = await Promise.all([
    probeHttp(site.id, site.url),
    probeTls(site.id, site.hostname),
    probeHeaders(site.id, site.url),
    probeDns(site.id, site.hostname),
  ]);
  for (const probe of [http, tls, headers, dns]) {
    insertProbe(probe);
  }
  const aggregate = rollup([http.status, tls.status, headers.status, dns.status]);
  recordProbeStatus(site.id, aggregate, new Date());
}

export async function runProbesForAllSites(): Promise<{ count: number }> {
  const orgId = getDemoOrgId();
  const sites = listSites(orgId).filter((s) => s.enabled);
  await Promise.allSettled(sites.map((s) => runAllProbesForSite(s)));
  return { count: sites.length };
}
