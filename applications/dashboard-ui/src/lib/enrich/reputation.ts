import "server-only";
import crypto from "node:crypto";

export interface ReputationResult {
  score: number;             // 0–100, higher = worse
  matches: string[];         // names of feeds that hit
  classification: "clean" | "suspicious" | "malicious";
}

// Deterministic-but-realistic mock: hash the IP, weight by ranges known to be
// historically abusive in real public reports (e.g. cloud abuse, VPN exit nodes).
// If ABUSEIPDB_KEY is set in the future, this can be replaced with a real call.
const BAD_PREFIXES = ["91.", "185.", "193.", "194.", "5.188.", "45.155.", "146.70."];

export async function lookupReputation(ip: string | null | undefined): Promise<ReputationResult> {
  if (!ip) return { score: 0, matches: [], classification: "clean" };

  // Bias score by hash; bias upward if prefix is in our "known bad" list.
  const h = crypto.createHash("sha256").update(ip).digest();
  let score = h[0] % 60;
  const matches: string[] = [];

  if (BAD_PREFIXES.some((p) => ip.startsWith(p))) {
    score += 40 + (h[1] % 20);
    matches.push("AbuseIPDB(mock)");
  }
  if (h[2] % 13 === 0) {
    matches.push("Spamhaus-DROP(mock)");
    score += 10;
  }
  if (h[3] % 17 === 0) {
    matches.push("Tor-exit(mock)");
    score += 8;
  }

  score = Math.min(100, score);
  const classification =
    score >= 70 ? "malicious"  :
    score >= 35 ? "suspicious" :
                  "clean";

  return { score, matches, classification };
}
