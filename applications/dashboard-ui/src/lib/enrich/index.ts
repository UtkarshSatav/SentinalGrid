import "server-only";
import { lookupGeo } from "./geoip";
import { lookupReputation } from "./reputation";
import { parseUA } from "./ua";
import { matchPatterns } from "./patterns";
import { computeThreatScore } from "./score";

export interface RawIngestEvent {
  source?: string;
  src_ip?: string | null;
  src_country?: string | null;
  method?: string | null;
  path?: string | null;
  status_code?: number | null;
  user_agent?: string | null;
  raw?: unknown;
}

export interface EnrichedEvent {
  source: string;
  severity: "low" | "medium" | "high" | "critical";
  srcIp: string | null;
  srcCountry: string | null;
  srcAsn: number | null;
  srcOrg: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  userAgent: string | null;
  uaBrowser: string | null;
  uaOs: string | null;
  uaBot: boolean;
  threatScore: number;
  tiMatches: string[];
  mitreTids: string[];
  raw: Record<string, unknown> | null;
}

export async function enrich(input: RawIngestEvent): Promise<EnrichedEvent> {
  const ua  = parseUA(input.user_agent);
  const geo = lookupGeo(input.src_ip);
  const rep = await lookupReputation(input.src_ip);
  const patterns = matchPatterns({
    path: input.path,
    userAgent: input.user_agent,
    raw: input.raw,
  });
  const { score, severity } = computeThreatScore({
    reputation: rep, patterns, statusCode: input.status_code ?? null, bot: ua.bot,
  });

  return {
    source: input.source ?? "access_log",
    severity,
    srcIp: input.src_ip ?? null,
    srcCountry: input.src_country ?? geo.country,
    srcAsn: geo.asn,
    srcOrg: geo.org,
    method: input.method ?? null,
    path: input.path ?? null,
    statusCode: input.status_code ?? null,
    userAgent: input.user_agent ?? null,
    uaBrowser: ua.browser,
    uaOs: ua.os,
    uaBot: ua.bot,
    threatScore: score,
    tiMatches: rep.matches,
    mitreTids: [...new Set(patterns.map((p) => p.mitre))],
    raw: (input.raw as Record<string, unknown> | undefined) ?? null,
  };
}
