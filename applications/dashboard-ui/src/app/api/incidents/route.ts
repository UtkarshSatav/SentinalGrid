import { NextResponse } from "next/server";
import { generateIncidents } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ incidents: generateIncidents() });
}
