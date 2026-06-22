"use client";

import { Bell, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

export default function Header({ title }: { title: string }) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString([], { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-10 backdrop-blur bg-bg/80 border-b border-border px-6 py-3 flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <div className="text-[11px] text-slate-400 flex items-center gap-2">
          <span className="dot-live" /> LIVE · UTC {time}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-bg-elev border border-border rounded-md text-xs text-slate-400 w-64">
          <Search size={14} />
          <span>Search events, incidents, IPs…</span>
          <kbd className="ml-auto text-[10px] px-1 py-0.5 bg-bg-panel rounded">⌘K</kbd>
        </div>
        <button className="relative p-2 rounded-md hover:bg-bg-panel" aria-label="alerts">
          <Bell size={16} className="text-slate-300" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent-red" />
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-elev border border-border">
          <ShieldCheck size={14} className="text-accent-green" />
          <span className="text-xs">a.patel</span>
        </div>
      </div>
    </header>
  );
}
