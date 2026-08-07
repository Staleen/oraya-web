import { NextResponse } from "next/server";
import { requireOps } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireOps(request);
  if (!auth.ok) return auth.response;
  const { id, email, full_name, role } = auth.staff;
  return NextResponse.json({ staff: { id, email, full_name, role } });
}
