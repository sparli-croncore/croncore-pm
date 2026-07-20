import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { providerAvailabilityAsync } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireUser();
  const providers = await providerAvailabilityAsync();
  return NextResponse.json({ providers });
}
