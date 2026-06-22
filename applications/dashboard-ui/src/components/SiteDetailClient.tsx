"use client";

import { useEffect, useState } from "react";
import { Activity, Lock, ShieldCheck, Globe, Copy, Check, Play, Zap, RefreshCw } from "lucide-react";
import clsx from "clsx";
import type { Site, Probe, Event } from "@/lib/db/schema";
import SeverityBadge from "@/components/SeverityBadge";

type Severity = "critical" | "high" | "medium" | "low";

function StatusBadge({ status }: { status: string | null | undefined }) {
  const map = { healthy: "badge-ok", degraded: "badge-warn", failed: "badge-fail" } as const;
  const klass = map[status as keyof typeof map] ?? "badge-medium";
  return <span className={`badge ${klass}`}>{status ?? "unknown"}</span>;
}

interface Props {
  site: Site;
  latest: Record<string, Probe>;
  initialProbes: Probe[];
  initialEvents: Event[];
}

export default function SiteDetailClient({ site, latest: latestInitial, initialProbes, initialEvents }: Props) {
  const [latest, setLatest] = useState(latestInitial);
  const [events, setEvents] = useState(initialEvents);
  const [tab, setTab]       = useState<"overview" | "events" | "integrations">("overview");
  const [busy, setBusy]     = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  async function probeNow() {
    setBusy(true);
    await fetch(`/api/sites/${site.id}/probe`, { method: "POST" });
    const r = await fetch(`/api/sites/${site.id}`, { cache: "no-store" });
    const j = await r.json();
    setLatest(j.latest);
    setEvents(j.events);
    setBusy(false);
  }

  async function simulate() {
    setSimResult("running…");
    const r = await fetch(`/api/sites/${site.id}/simulate?count=60`, { method: "POST" });
    const j = await r.json();
    setSimResult(`${j.accepted}/${j.sent} events accepted`);
    setTimeout(refreshEvents, 800);
  }

  async function refreshEvents() {
    const r = await fetch(`/api/sites/${site.id}`, { cache: "no-store" });
    const j = await r.json();
    setEvents(j.events);
  }

  useEffect(() => {
    if (tab !== "events") return;
    const id = setInterval(refreshEvents, 2500);
    return () => clearInterval(id);
  }, [tab]);

  const http    = latest["http"];
  const tls     = latest["tls"];
  const headers = latest["headers"];
  const dns     = latest["dns"];

  return (
    <main className="p-6 space-y-6">
      {/* tab bar */}
      <div className="flex items-center gap-2 border-b border-border">
        {(["overview", "events", "integrations"] as const).map((t) => (
          <button key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-4 py-2 text-sm border-b-2 -mb-px capitalize",
              tab === t ? "border-accent text-accent" : "border-transparent text-slate-400 hover:text-slate-200"
            )}
          >{t}</button>
        ))}
        <div className="flex-1" />
        <button onClick={probeNow} disabled={busy}
          className="text-xs px-3 py-1.5 border border-border rounded-md bg-bg-elev hover:bg-bg-panel inline-flex items-center gap-1 disabled:opacity-50">
          <RefreshCw size={12} className={clsx(busy && "animate-spin")} />
          Probe now
        </button>
      </div>

      {tab === "overview" && (
        <>
          <section className="grid md:grid-cols-4 gap-4">
            <ProbePanel icon={Activity} title="HTTP"     probe={http} />
            <ProbePanel icon={Lock}     title="TLS"      probe={tls}  />
            <ProbePanel icon={ShieldCheck} title="Headers" probe={headers} />
            <ProbePanel icon={Globe}    title="DNS"      probe={dns}  />
          </section>

          {tls?.details && typeof tls.details === "object" && (
            <section className="panel p-5">
              <div className="text-sm font-semibold text-slate-200 mb-3">TLS Certificate</div>
              <div className="grid md:grid-cols-3 gap-3 text-xs text-slate-400">
                <Field label="Issuer"   value={String((tls.details as Record<string, unknown>).issuer ?? "—")} />
                <Field label="Subject"  value={String((tls.details as Record<string, unknown>).subject ?? "—")} />
                <Field label="Expires"  value={String((tls.details as Record<string, unknown>).valid_to ?? "—")} />
                <Field label="Days left"value={String((tls.details as Record<string, unknown>).days_remaining ?? "—")} />
                <Field label="Protocol" value={String((tls.details as Record<string, unknown>).protocol ?? "—")} />
                <Field label="Cipher"   value={String((tls.details as Record<string, unknown>).cipher ?? "—")} />
              </div>
            </section>
          )}

          {headers?.details && typeof headers.details === "object" && (
            <section className="panel p-5">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-sm font-semibold text-slate-200">Security Headers</div>
                <div className="text-lg font-bold tabular-nums">
                  {(headers.details as Record<string, unknown>).grade as string} ·{" "}
                  <span className="text-sm text-slate-400">{(headers.details as Record<string, unknown>).score as number}/100</span>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-2 text-xs">
                {Object.entries((headers.details as { present: Record<string, string | null> }).present ?? {}).map(([h, v]) => (
                  <div key={h} className="flex items-center gap-2">
                    <span className={clsx("inline-block w-2 h-2 rounded-full", v ? "bg-accent-green" : "bg-accent-red")} />
                    <span className="text-slate-300 font-mono">{h}</span>
                    {!v && <span className="text-accent-red text-[10px] ml-auto">missing</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-200">Simulate an attack</div>
              <button onClick={simulate}
                className="text-xs inline-flex items-center gap-1 px-3 py-1.5 bg-accent-red/15 border border-accent-red/30 text-accent-red rounded hover:bg-accent-red/25">
                <Zap size={12} /> Run brute-force simulation (60 events)
              </button>
            </div>
            <div className="text-xs text-slate-400">
              Fires 60 synthetic events through the real ingest API. The rule engine should group them
              into one critical incident; if a Slack webhook is configured on this site you'll get a real ping.
            </div>
            {simResult && <div className="mt-2 text-xs text-accent">{simResult}</div>}
          </section>
        </>
      )}

      {tab === "events" && (
        <section className="panel overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-200">Live events</div>
            <span className="text-xs text-slate-400">refresh 2.5 s · {events.length} shown</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-bg-elev text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">Severity</th>
                <th className="text-left px-3 py-2">Method · Path</th>
                <th className="text-left px-3 py-2">Src IP</th>
                <th className="text-left px-3 py-2">Country</th>
                <th className="text-left px-3 py-2">Score</th>
                <th className="text-left px-3 py-2">MITRE</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-1.5 text-xs text-slate-400 tabular-nums">
                    {new Date(e.ingestedAt).toLocaleTimeString([], { hour12: false })}
                  </td>
                  <td className="px-3 py-1.5"><SeverityBadge severity={e.severity as Severity} /></td>
                  <td className="px-3 py-1.5 text-slate-300 text-xs">
                    <span className="text-slate-500">{e.method ?? "—"}</span> <span className="font-mono">{e.path ?? "—"}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs">{e.srcIp ?? "—"}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-400">{e.srcCountry ?? "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums text-xs">{e.threatScore ?? 0}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-400">{(e.mitreTids ?? []).join(", ") || "—"}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-500 text-sm">
                  No events yet. Run the attack simulator on the Overview tab, or use the curl below in Integrations.
                </td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {tab === "integrations" && (
        <IntegrationsTab site={site} copy={copy} copied={copied} />
      )}
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-slate-200">{value}</div>
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
function ProbePanel({ icon: Icon, title, probe }: { icon: LucideIcon; title: string; probe?: Probe }) {
  return (
    <div className="panel p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{title}</span>
        <Icon size={14} className="text-accent" />
      </div>
      {probe ? (
        <>
          <StatusBadge status={probe.status} />
          <div className="text-xs text-slate-400 tabular-nums">
            {probe.latencyMs != null ? `${probe.latencyMs} ms` : ""}
            {probe.statusCode != null ? ` · ${probe.statusCode}` : ""}
          </div>
        </>
      ) : (
        <div className="text-xs text-slate-500">Awaiting first probe…</div>
      )}
    </div>
  );
}

function IntegrationsTab({ site, copy, copied }: { site: Site; copy: (t: string, k: string) => void; copied: string | null }) {
  const [keyValue, setKeyValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function mintKey() {
    setBusy(true);
    const r = await fetch(`/api/sites/${site.id}/keys`, { method: "POST", body: JSON.stringify({ label: "integration" }) });
    const j = await r.json();
    setKeyValue(j.secret);
    setBusy(false);
  }
  const k = keyValue ?? "<paste your key here>";
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const curl = `curl -X POST '${base}/api/v1/ingest/${site.id}' \\
  -H "Authorization: Bearer ${k}" \\
  -H "Content-Type: application/json" \\
  -d '{"source":"manual","src_ip":"203.0.113.42","method":"GET","path":"/login","status_code":401,"user_agent":"curl/8.0"}'`;
  const worker = `// Cloudflare Worker — paste into wrangler.toml-backed Worker
export default {
  async fetch(req, env, ctx) {
    const res = await fetch(req);
    ctx.waitUntil(fetch("${base}/api/v1/ingest/${site.id}", {
      method: "POST",
      headers: { "Authorization": "Bearer ${k}", "content-type": "application/json" },
      body: JSON.stringify({
        source: "access_log",
        method: req.method,
        path: new URL(req.url).pathname,
        status_code: res.status,
        user_agent: req.headers.get("user-agent"),
        src_ip: req.headers.get("cf-connecting-ip"),
        src_country: req.cf?.country,
      }),
    }));
    return res;
  },
};`;
  return (
    <div className="space-y-4">
      <div className="panel p-5 space-y-3">
        <div className="text-sm font-semibold text-slate-200">API key</div>
        {!keyValue ? (
          <button onClick={mintKey} disabled={busy}
            className="text-xs px-3 py-2 rounded bg-accent text-white inline-flex items-center gap-1 disabled:opacity-50">
            <Play size={12} /> {busy ? "Minting…" : "Mint a new ingest key"}
          </button>
        ) : (
          <div className="bg-bg-elev border border-border rounded-md p-3 font-mono text-sm flex items-center gap-3">
            <span className="flex-1 break-all">{keyValue}</span>
            <button onClick={() => copy(keyValue!, "key")}
              className="text-xs px-2 py-1 border border-border rounded bg-bg-panel hover:bg-bg flex items-center gap-1">
              {copied === "key" ? <Check size={12} /> : <Copy size={12} />} {copied === "key" ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>

      <Snippet title="curl one-liner" code={curl} k="curl" copy={copy} copied={copied} />
      <Snippet title="Cloudflare Worker" code={worker} k="cf" copy={copy} copied={copied} />
    </div>
  );
}

function Snippet({ title, code, k, copy, copied }: { title: string; code: string; k: string; copy: (t: string, k: string) => void; copied: string | null }) {
  return (
    <div className="panel">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">{title}</div>
        <button onClick={() => copy(code, k)}
          className="text-xs px-2 py-1 border border-border rounded bg-bg-elev hover:bg-bg flex items-center gap-1">
          {copied === k ? <Check size={12} /> : <Copy size={12} />} {copied === k ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 text-xs leading-relaxed overflow-x-auto text-slate-300 font-mono">{code}</pre>
    </div>
  );
}
