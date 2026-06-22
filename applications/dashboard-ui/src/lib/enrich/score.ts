import "server-only";
import type { PatternHit } from "./patterns";
import type { ReputationResult } from "./reputation";

interface ScoreInput {
  reputation: ReputationResult;
  patterns: PatternHit[];
  statusCode?: number | null;
  bot: boolean;
}

const SEV_WEIGHT = { low: 10, medium: 30, high: 60, critical: 90 } as const;

export function computeThreatScore({ reputation, patterns, statusCode, bot }: ScoreInput): {
  score: number; severity: "low" | "medium" | "high" | "critical";
} {
  let score = Math.round(reputation.score * 0.4);
  for (const p of patterns) score = Math.max(score, SEV_WEIGHT[p.severity]);
  if (bot) score = Math.min(100, score + 6);
  if (statusCode && (statusCode === 401 || statusCode === 403)) score = Math.min(100, score + 8);
  if (statusCode === 200 && patterns.some((p) => p.category !== "auth")) score = Math.min(100, score + 12);
  const severity = score >= 90 ? "critical" : score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return { score, severity };
}
