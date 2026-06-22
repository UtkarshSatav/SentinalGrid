import "server-only";

interface SlackAlert {
  title: string;
  severity: string;
  site: string;
  rule: string;
  fingerprint: string;
}

const COLOR = {
  critical: "#dc2626",
  high:     "#f59e0b",
  medium:   "#06b6d4",
  low:      "#10b981",
} as const;

export async function notifySlack(webhookUrl: string, a: SlackAlert): Promise<void> {
  const color = COLOR[a.severity as keyof typeof COLOR] ?? "#6366f1";
  const body = {
    text: `:rotating_light: ${a.title}`,
    attachments: [{
      color,
      title: a.title,
      fields: [
        { title: "Severity",    value: a.severity, short: true },
        { title: "Site",        value: a.site,     short: true },
        { title: "Rule",        value: a.rule,     short: true },
        { title: "Fingerprint", value: a.fingerprint, short: true },
      ],
      footer: "SentinelGrid",
      ts: Math.floor(Date.now() / 1000),
    }],
  };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`slack webhook ${res.status}`);
}
