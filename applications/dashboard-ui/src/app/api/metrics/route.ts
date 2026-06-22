import { NextResponse } from "next/server";
import { getMetrics, generateEventRateSeries } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = getMetrics();
  // wobble the EPS every second so the dashboard feels live
  const wobble = Math.round(Math.sin(Date.now() / 5000) * 1200);
  return NextResponse.json({
    metrics: { ...base, eventsPerSecond: base.eventsPerSecond + wobble },
    series: generateEventRateSeries(),
  });
}
