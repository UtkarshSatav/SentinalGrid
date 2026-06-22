import Header from "@/components/Header";
import { generateInfra, getMetrics } from "@/lib/mockData";
import StatCard from "@/components/StatCard";
import { Globe, Database, Lock, Server } from "lucide-react";
import clsx from "clsx";

export const dynamic = "force-dynamic";

export default function InfraPage() {
  const components = generateInfra();
  const m = getMetrics();
  const byRegion = (region: "us-east-1" | "us-west-2") =>
    components.filter(c => c.region === region);

  return (
    <>
      <Header title="Infrastructure & DR" />
      <main className="p-6 space-y-6">
        <section className="grid md:grid-cols-4 gap-4">
          <StatCard label="Primary region"          value="us-east-1"        sub="all workloads · 39 nodes"  icon={Globe}    tone="green" />
          <StatCard label="DR region (warm)"        value="us-west-2"        sub="12 nodes · scale-ready"    icon={Globe}    tone="green" />
          <StatCard label="Cross-region rep lag"    value={`${m.replicationLagSec} s`} sub="RDS · MSK · ES" icon={Database} tone="green" />
          <StatCard label="Vault HA"                value="Unsealed"         sub="Raft 3-node · KMS unseal"  icon={Lock}     tone="green" />
        </section>

        {(["us-east-1", "us-west-2"] as const).map(region => (
          <section key={region} className="panel overflow-hidden">
            <header className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server size={14} className="text-accent" />
                <span className="text-sm font-semibold text-slate-200">
                  {region === "us-east-1" ? "Primary" : "DR (warm standby)"} · {region}
                </span>
              </div>
              <span className="text-xs text-slate-500">{byRegion(region).length} components</span>
            </header>
            <table className="w-full text-sm">
              <thead className="bg-bg-elev text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2">Component</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {byRegion(region).map(c => (
                  <tr key={c.name} className="border-t border-border">
                    <td className="px-3 py-2 text-slate-200">{c.name}</td>
                    <td className="px-3 py-2 text-slate-400">{c.type}</td>
                    <td className="px-3 py-2">
                      <span className={clsx("badge", {
                        "badge-ok":   c.status === "healthy",
                        "badge-warn": c.status === "degraded",
                        "badge-fail": c.status === "failing",
                      })}>{c.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <section className="panel p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">Disaster recovery posture</h2>
          <div className="grid md:grid-cols-3 gap-4 text-xs text-slate-400">
            <div>
              <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">RPO target</div>
              <div className="text-xl text-slate-100 font-semibold">≤ 5 min</div>
              <div className="mt-1">bounded by replication lag · alerts page above 60 s</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">RTO target</div>
              <div className="text-xl text-slate-100 font-semibold">≤ 30 min</div>
              <div className="mt-1">Route 53 failover + RDS promote + EKS scale-up</div>
            </div>
            <div>
              <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-1">Last drill</div>
              <div className="text-xl text-slate-100 font-semibold">28 min</div>
              <div className="mt-1">passed · 2026-05-22 · full regional cutover</div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
