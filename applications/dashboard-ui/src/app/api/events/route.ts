import { NextResponse } from "next/server";
import { generateEvents } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit    = Math.min(parseInt(url.searchParams.get("limit") ?? "60", 10), 500);
  const severity = url.searchParams.get("severity");
  const sector   = url.searchParams.get("sector");
  // re-seed every 5s so the table feels live without violating determinism within a window
  const seed = Math.floor(Date.now() / 5000);

  let events = generateEvents(limit, seed);
  if (severity) events = events.filter(e => e.severity === severity);
  if (sector)   events = events.filter(e => e.sector === sector);

  return NextResponse.json({ count: events.length, events });
}
