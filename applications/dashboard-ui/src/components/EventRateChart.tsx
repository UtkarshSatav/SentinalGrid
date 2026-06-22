"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Pt { t: string; eps: number }

export default function EventRateChart({ data }: { data: Pt[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="eps" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.55}/>
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis
          dataKey="t"
          tickFormatter={(v: string) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          tick={{ fill: "#64748b", fontSize: 10 }}
          axisLine={{ stroke: "#1e293b" }}
          tickLine={false}
          minTickGap={48}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 10 }}
          axisLine={{ stroke: "#1e293b" }}
          tickLine={false}
          tickFormatter={(v: number) => `${(v/1000).toFixed(0)}k`}
          width={36}
        />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12, borderRadius: 6 }}
          labelStyle={{ color: "#cbd5e1" }}
          formatter={(v: number) => [`${v.toLocaleString()} events/sec`, "Rate"]}
          labelFormatter={(v: string) => new Date(v).toLocaleString()}
        />
        <Area type="monotone" dataKey="eps" stroke="#6366f1" strokeWidth={2} fill="url(#eps)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
