import { NextResponse } from "next/server";
import { features } from "@/lib/env";

export const dynamic = "force-dynamic";

export function GET() {
  const f = features();
  return NextResponse.json({
    ok: true,
    edition: f.edition,
    ee: f.eeLoaded,
    mode: process.env.DATABASE_URL ? "db" : "demo",
  });
}
