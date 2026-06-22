import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

export default function StatCard({
  label, value, sub, icon: Icon, tone = "accent",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  tone?: "accent" | "green" | "amber" | "red" | "cyan";
}) {
  const ring = {
    accent: "text-accent",
    green:  "text-accent-green",
    amber:  "text-accent-amber",
    red:    "text-accent-red",
    cyan:   "text-accent-cyan",
  }[tone];

  return (
    <div className="stat">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-slate-400">{label}</span>
        <Icon size={16} className={clsx(ring)} />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
