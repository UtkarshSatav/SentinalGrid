"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import SeverityBadge from "@/components/SeverityBadge";
import type { ThreatEvent, Severity } from "@/lib/types";

const SEVERITIES: (Severity | "all")[] = ["all", "critical", "high", "medium", "low"];

export default function EventsPage() {
  const [events, setEvents]     = useState<ThreatEvent[]>([]);
  const [filter, setFilter]     = useState<Severity | "all">("all");
  const [paused, setPaused]     = useState(false);

  useEffect(() => {
    if (paused) return;
    let cancelled = false;
    const fetchEvents = async () => {
      const url = filter === "all" ? "/api/events?limit=80" : `/api/events?limit=80&severity=${filter}`;
      const res = await fetch(url, { cache: "no-store" });
      if (cancelled) return;
      const json = await res.json();
      setEvents(json.events);
    };
    fetchEvents();
    const id = setInterval(fetchEvents, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [filter, paused]);

  return (
    <>
      <Header title="Live Threat Feed" />
      <main className="p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-400 uppercase tracking-wider">Severity</span>
          {SEVERITIES.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={
                "text-xs px-2 py-1 rounded-md border transition-colors " +
                (filter === s
                  ? "bg-accent/15 border-accent/40 text-accent"
                  : "bg-bg-elev border-border text-slate-300 hover:text-white")
              }
            >
              {s}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setPaused(p => !p)}
            className="text-xs px-3 py-1 rounded-md border border-border bg-bg-elev hover:bg-bg-panel"
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <span className="text-xs text-slate-400">{events.length} events · refresh 5 s</span>
        </div>

        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elev text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">Time</th>
                <th className="text-left px-3 py-2">Severity</th>
                <th className="text-left px-3 py-2">Event</th>
                <th className="text-left px-3 py-2">Source</th>
                <th className="text-left px-3 py-2">Sector</th>
                <th className="text-left px-3 py-2">Src IP</th>
                <th className="text-left px-3 py-2">Country</th>
                <th className="text-left px-3 py-2">MITRE</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.map(e => (
                <tr key={e.id} className="border-t border-border hover:bg-bg-elev/60">
                  <td className="px-3 py-1.5 text-xs text-slate-400 tabular-nums">
                    {new Date(e.timestamp).toLocaleTimeString([], { hour12: false })}
                  </td>
                  <td className="px-3 py-1.5"><SeverityBadge severity={e.severity} /></td>
                  <td className="px-3 py-1.5 text-slate-200">{e.eventType.replace(/_/g, " ")}</td>
                  <td className="px-3 py-1.5 text-slate-300">{e.sourceOrg}</td>
                  <td className="px-3 py-1.5 text-slate-400">{e.sector}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{e.srcIp}</td>
                  <td className="px-3 py-1.5 text-slate-400">{e.srcCountry}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-400">{e.mitreTechnique}</td>
                  <td className="px-3 py-1.5">
                    <span className={
                      e.status === "actioned" ? "badge badge-ok" :
                      e.status === "analyzed" ? "badge badge-medium" :
                                                "badge badge-warn"
                    }>{e.status}</span>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-slate-500 text-sm">Loading events…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
