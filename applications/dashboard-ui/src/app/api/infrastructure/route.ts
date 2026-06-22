import { NextResponse } from "next/server";
import { generateInfra, generateSubscribers } from "@/lib/mockData";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    components:  generateInfra(),
    subscribers: generateSubscribers(),
  });
}
