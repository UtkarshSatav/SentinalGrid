import Header from "@/components/Header";
import SeverityBadge from "@/components/SeverityBadge";
import { generateIncidents } from "@/lib/mockData";
import { Check, Loader2, AlertOctagon, Clock } from "lucide-react";
import clsx from "clsx";

export const dynamic = "force-dynamic";

const STATE_ICON = {
  done:    <Check    size={12} className="text-accent-green" />,
  running: <Loader2  size={12} className="text-accent animate-spin" />,
  pending: <Clock    size={12} className="text-slate-500" />,
  failed:  <AlertOctagon size={12} className="text-accent-red" />,
};

export default function IncidentsPage() {
  const incidents = generateIncidents();
  return (
    <>
      <Header title="Incident Response" />
      <main className="p-6 space-y-4">
        <div className="text-xs text-slate-400">
          {incidents.filter(i => i.status !== "resolved").length} active · {incidents.length} total · sorted by recency
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          {incidents.map(i => (
            <article key={i.id} className="panel p-5 flex flex-col gap-3">
              <header className="flex items-start gap-3">
                <SeverityBadge severity={i.severity} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-100 leading-snug">{i.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {i.id} · {i.sector} · created {new Date(i.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className={
                  i.status === "open"          ? "badge badge-critical" :
                  i.status === "investigating" ? "badge badge-high" :
                  i.status === "contained"     ? "badge badge-medium" :
                                                 "badge badge-ok"
                }>{i.status}</span>
              </header>

              <div className="grid grid-cols-3 gap-3 text-xs text-slate-400">
                <div>
                  <div className="text-slate-500 uppercase tracking-wider text-[10px]">Playbook</div>
                  <div className="text-slate-200">{i.playbook}</div>
                </div>
                <div>
                  <div className="text-slate-500 uppercase tracking-wider text-[10px]">Assignee</div>
                  <div className="text-slate-200">{i.assignee}</div>
                </div>
                <div>
                  <div className="text-slate-500 uppercase tracking-wider text-[10px]">Affected assets</div>
                  <div className="text-slate-200">{i.affectedAssets}</div>
                </div>
              </div>

              <ol className="space-y-1">
                {i.steps.map((s, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs">
                    {STATE_ICON[s.state]}
                    <span className={clsx(
                      s.state === "done"    ? "text-slate-400 line-through" :
                      s.state === "running" ? "text-slate-100"               :
                      s.state === "failed"  ? "text-accent-red"             :
                                              "text-slate-500"
                    )}>
                      {s.name}
                    </span>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      </main>
    </>
  );
}
