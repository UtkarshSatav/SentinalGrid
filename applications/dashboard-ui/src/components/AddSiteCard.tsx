"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState } from "react";
import { Plus, Loader2, Copy, Check } from "lucide-react";

export default function AddSiteCard() {
  const router = useRouter();
  const [url, setUrl]       = useState("");
  const [name, setName]     = useState("");
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [issued, setIssued] = useState<{ id: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, name: name || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error?.fieldErrors?.url?.[0] ?? json.error ?? "failed"); return; }
      setIssued({ id: json.id, key: json.key });
    } catch (e) {
      setErr(String((e as Error).message));
    } finally { setBusy(false); }
  }

  function done() {
    if (!issued) return;
    router.push(`/sites/${issued.id}` as Route);
  }

  if (issued) {
    return (
      <div className="panel p-6 space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-200">Site added · here is your API key</div>
          <div className="text-xs text-slate-400 mt-1">
            Save this now — it's the only time you'll see the full key.
          </div>
        </div>
        <div className="bg-bg-elev border border-border rounded-md p-3 font-mono text-sm flex items-center gap-3">
          <span className="flex-1 break-all">{issued.key}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(issued.key); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="text-xs px-2 py-1 border border-border rounded bg-bg-panel hover:bg-bg flex items-center gap-1"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <button onClick={done} className="text-sm px-3 py-2 rounded bg-accent text-white font-medium hover:opacity-90">
          Open site dashboard →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="panel p-5 space-y-3">
      <div className="text-sm font-semibold text-slate-200">Add a new site</div>
      <div className="grid md:grid-cols-2 gap-3">
        <input
          type="url" required value={url} onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="bg-bg-elev border border-border rounded-md px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-accent"
        />
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Display name (optional)"
          className="bg-bg-elev border border-border rounded-md px-3 py-2 text-sm placeholder:text-slate-500 focus:outline-none focus:border-accent"
        />
      </div>
      {err && <div className="text-xs text-accent-red">{err}</div>}
      <button
        type="submit" disabled={busy}
        className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        {busy ? "Adding…" : "Add site"}
      </button>
    </form>
  );
}
