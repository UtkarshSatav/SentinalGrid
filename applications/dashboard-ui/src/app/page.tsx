import Header from "@/components/Header";
import StatCard from "@/components/StatCard";
import EventRateChart from "@/components/EventRateChart";
import SeverityBadge from "@/components/SeverityBadge";
import {
  Activity, AlertOctagon, ShieldCheck, Share2, Gauge, Globe, Lock, Database,
} from "lucide-react";
import {
  getMetrics, generateEventRateSeries, generateEvents, generateIncidents,
} from "@/lib/mockData";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const m = getMetrics();
  const series = generateEventRateSeries();
  const topEvents = generateEvents(8).filter(e => e.severity === "critical" || e.severity === "high");
  const activeIncidents = generateIncidents().filter(i => i.status !== "resolved").slice(0, 4);

  return (
    <>
      <Header title="Operations Overview" />
      <main className="p-6 space-y-6">
        {/* Top stat grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Events / second"   value={m.eventsPerSecond.toLocaleString()} sub="14.3k baseline · spikes to 21k" icon={Activity} tone="accent" />
          <StatCard label="Active incidents"  value={m.activeIncidents}                  sub="3 critical · 6 high"           icon={AlertOctagon} tone="red" />
          <StatCard label="Subscribing orgs"  value={m.subscribingOrgs}                  sub={`${m.iocsPublished24h.toLocaleString()} IOCs / 24h`} icon={Share2} tone="cyan" />
          <StatCard label="p99 ingestion"     value={`${m.p99IngestionMs} ms`}           sub={`SLO budget: ${m.errorBudgetRemaining}%`} icon={Gauge} tone="green" />
        </section>

        {/* Event rate */}
        <section className="panel p-5">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-wide text-slate-200">Event ingestion rate · last 24 h</h2>
            <span className="text-xs text-slate-400">{m.eventsLast24h.toLocaleString()} events processed</span>
          </div>
          <EventRateChart data={series} />
        </section>

        {/* Two-column: top threats + active incidents */}
        <section className="grid lg:grid-cols-2 gap-6">
          <div className="panel p-5">
            <h2 className="text-sm font-semibold tracking-wide text-slate-200 mb-3">Recent high-severity events</h2>
            <ul className="divide-y divide-border">
              {topEvents.map(e => (
                <li key={e.id} className="py-2 flex items-center gap-3 text-sm">
                  <SeverityBadge severity={e.severity} />
                  <span className="text-slate-200 truncate flex-1">{e.eventType.replace(/_/g, " ")} from <span className="font-mono text-xs text-slate-400">{e.srcIp}</span> ({e.srcCountry})</span>
                  <span className="text-xs text-slate-500">{new Date(e.timestamp).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-5">
            <h2 className="text-sm font-semibold tracking-wide text-slate-200 mb-3">Active incidents</h2>
            <ul className="space-y-2">
              {activeIncidents.map(i => (
                <li key={i.id} className="flex items-center gap-3 text-sm py-2 border border-border rounded-md px-3 bg-bg-elev">
                  <SeverityBadge severity={i.severity} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-slate-200">{i.title}</div>
                    <div className="text-xs text-slate-500">{i.id} · {i.playbook} · {i.assignee}</div>
                  </div>
                  <span className={
                    i.status === "open"          ? "badge badge-critical" :
                    i.status === "investigating" ? "badge badge-high"     :
                                                   "badge badge-medium"
                  }>{i.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Region + security strip */}
        <section className="grid md:grid-cols-4 gap-4">
          <StatCard label="Primary region us-east-1" value="Healthy" sub="EKS · RDS · MSK · ES · Vault" icon={Globe}      tone="green" />
          <StatCard label="DR region us-west-2"      value="Warm"    sub={`Replication lag ${m.replicationLagSec}s`} icon={Globe}      tone="green" />
          <StatCard label="Vault status"             value="Unsealed" sub="Raft leader: vault-1"        icon={Lock}       tone="green" />
          <StatCard label="Audit bucket (Object Lock)" value="OK"    sub="COMPLIANCE · CRR 99.99%"      icon={Database}   tone="green" />
        </section>
      </main>
    </>
  );
}
