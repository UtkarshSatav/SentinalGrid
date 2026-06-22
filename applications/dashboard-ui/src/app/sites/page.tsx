import Link from "next/link";
import Header from "@/components/Header";
import { listSites } from "@/lib/db/repo/sites";
import { getDemoOrgId } from "@/lib/db/repo/orgs";
import AddSiteCard from "@/components/AddSiteCard";
import { Globe, CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import clsx from "clsx";

export const dynamic = "force-dynamic";

const STATUS = {
  healthy:  { Icon: CheckCircle2, klass: "text-accent-green", label: "Healthy" },
  degraded: { Icon: AlertTriangle, klass: "text-accent-amber", label: "Degraded" },
  failed:   { Icon: XCircle,       klass: "text-accent-red",   label: "Failed" },
  unknown:  { Icon: HelpCircle,    klass: "text-slate-400",    label: "Unknown" },
} as const;

export default function SitesPage() {
  const orgId = getDemoOrgId();
  const sites = listSites(orgId);

  return (
    <>
      <Header title="Monitored Sites" />
      <main className="p-6 space-y-6">
        <AddSiteCard />

        {sites.length === 0 ? (
          <div className="panel p-8 text-center text-slate-400 text-sm">
            No sites yet. Add one above to start monitoring.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((s) => {
              const meta = STATUS[(s.lastStatus ?? "unknown") as keyof typeof STATUS] ?? STATUS.unknown;
              return (
                <Link key={s.id} href={{ pathname: `/sites/${s.id}` as `/sites/${string}` }}
                      className="panel p-5 hover:border-accent transition-colors block">
                  <div className="flex items-center gap-3">
                    <Globe size={18} className="text-accent" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">{s.name}</div>
                      <div className="text-xs text-slate-500 truncate">{s.url}</div>
                    </div>
                    <meta.Icon size={18} className={clsx(meta.klass)} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{meta.label}</span>
                    <span>
                      {s.lastProbeAt
                        ? `probed ${new Date(s.lastProbeAt).toLocaleTimeString()}`
                        : "no probes yet"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
