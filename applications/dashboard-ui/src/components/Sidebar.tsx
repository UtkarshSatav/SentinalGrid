"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  ShieldAlert, Activity, AlertOctagon, Share2, Server, Radar, Globe,
} from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/",               label: "Overview",       Icon: Radar },
  { href: "/sites",          label: "Sites",          Icon: Globe },
  { href: "/events",         label: "Threat Feed",    Icon: Activity },
  { href: "/incidents",      label: "Incidents",      Icon: AlertOctagon },
  { href: "/intel",          label: "Intel Feeds",    Icon: Share2 },
  { href: "/infrastructure", label: "Infrastructure", Icon: Server },
] as const;

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden md:flex flex-col w-60 bg-bg-elev border-r border-border h-screen sticky top-0">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <ShieldAlert className="text-accent" size={22} />
        <div className="leading-tight">
          <div className="font-semibold text-sm tracking-wide">SentinelGrid</div>
          <div className="text-[10px] uppercase text-slate-400 tracking-widest">SOC Console</div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href as Route}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "text-slate-300 hover:bg-bg-panel hover:text-white"
              )}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-border text-[11px] text-slate-500 leading-snug">
        <div className="flex items-center gap-2 mb-1">
          <span className="dot-live" />
          <span>Primary region operational</span>
        </div>
        <div>v1.0.0 · build 20260614</div>
      </div>
    </aside>
  );
}
