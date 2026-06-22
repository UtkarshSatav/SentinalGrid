import Header from "@/components/Header";
import { generateSubscribers, getMetrics } from "@/lib/mockData";
import StatCard from "@/components/StatCard";
import { Share2, Globe, FileCheck2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default function IntelPage() {
  const subs = generateSubscribers();
  const m = getMetrics();

  return (
    <>
      <Header title="Intel Distribution" />
      <main className="p-6 space-y-6">
        <section className="grid md:grid-cols-3 gap-4">
          <StatCard label="Subscribing organizations" value={m.subscribingOrgs}                    sub="across 6 sectors"             icon={Globe}      tone="cyan" />
          <StatCard label="IOCs published (24 h)"     value={m.iocsPublished24h.toLocaleString()}  sub="STIX 2.1 + TAXII 2.1"        icon={Share2}     tone="accent" />
          <StatCard label="Feed format compliance"    value="100%"                                  sub="schema-validated before publish" icon={FileCheck2} tone="green" />
        </section>

        <section className="panel overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-sm font-semibold text-slate-200">Top subscribers</div>
          <table className="w-full text-sm">
            <thead className="bg-bg-elev text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="text-left px-3 py-2">Organisation</th>
                <th className="text-left px-3 py-2">Sector</th>
                <th className="text-left px-3 py-2">Feed format</th>
                <th className="text-left px-3 py-2 tabular-nums">IOCs delivered (24 h)</th>
                <th className="text-left px-3 py-2">Last pull</th>
              </tr>
            </thead>
            <tbody>
              {subs.map(s => (
                <tr key={s.org} className="border-t border-border hover:bg-bg-elev/60">
                  <td className="px-3 py-2 text-slate-200">{s.org}</td>
                  <td className="px-3 py-2 text-slate-400">{s.sector}</td>
                  <td className="px-3 py-2"><span className="badge badge-medium">{s.feedFormat}</span></td>
                  <td className="px-3 py-2 font-mono text-xs">{s.iocsDelivered24h.toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-slate-400">{new Date(s.lastPullAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel p-5">
          <h2 className="text-sm font-semibold text-slate-200 mb-2">Distribution pipeline</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Threat intel produced by <span className="text-slate-200">threat-analysis</span> is
            published to Kafka topic <span className="font-mono text-accent">scored-events</span>,
            consumed by <span className="text-slate-200">intel-distribution</span>, formatted as
            STIX 2.1, and exposed via a TAXII 2.1 collection. Subscribing organisations pull on
            their own schedule; mutual-TLS authenticates every request and OPA policy enforces
            per-org collection access.
          </p>
        </section>
      </main>
    </>
  );
}
