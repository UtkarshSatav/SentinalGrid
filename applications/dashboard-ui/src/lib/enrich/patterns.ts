import "server-only";

export interface PatternHit {
  name: string;
  category: "sqli" | "xss" | "traversal" | "scanner" | "auth" | "exploit";
  severity: "low" | "medium" | "high" | "critical";
  mitre: string;     // ATT&CK technique ID
}

const RULES: { rx: RegExp; hit: PatternHit }[] = [
  { rx: /\b(union\s+select|or\s+1=1|';--|sleep\(\d+\)|benchmark\()\b/i,
    hit: { name: "SQL injection signature", category: "sqli", severity: "critical", mitre: "T1190" } },
  { rx: /<script\b|onerror\s*=|onload\s*=|javascript:|\bsrc\s*=\s*["']?data:/i,
    hit: { name: "XSS payload",              category: "xss",      severity: "high",     mitre: "T1059.007" } },
  { rx: /(\.\.\/|\.\.\\|\/etc\/passwd|\/proc\/self|c:\\windows\\)/i,
    hit: { name: "Path traversal",           category: "traversal",severity: "high",     mitre: "T1083" } },
  { rx: /\/(wp-admin|wp-login|phpmyadmin|\.git\/config|\.env)\b/i,
    hit: { name: "Sensitive-path probe",     category: "scanner",  severity: "medium",   mitre: "T1190" } },
  { rx: /\/(login|signin|signup|auth|oauth)\b/i,
    hit: { name: "Auth endpoint access",     category: "auth",     severity: "low",      mitre: "T1078" } },
  { rx: /\b(eval\(|base64_decode|system\(|exec\(|passthru)\b/i,
    hit: { name: "Code-execution gadget",    category: "exploit",  severity: "critical", mitre: "T1059" } },
];

export function matchPatterns(input: { path?: string | null; userAgent?: string | null; raw?: unknown }): PatternHit[] {
  const haystack = [input.path ?? "", input.userAgent ?? "", JSON.stringify(input.raw ?? {})].join(" | ");
  const out: PatternHit[] = [];
  for (const r of RULES) if (r.rx.test(haystack)) out.push(r.hit);
  return out;
}
