import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getHostedCheckoutAdminStatus } from "@/lib/payments/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  return NextResponse.json({
    status: await getHostedCheckoutAdminStatus(),
  });
}
