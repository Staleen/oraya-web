import { adminApiFetchInit } from "@/lib/admin-auth";
import type { BookingAddonSnapshot } from "../types";

/**
 * Remediation 5.1 — the one approve/decline add-on API call, shared by
 * BookingsTable and DashboardOperationsView (previously duplicated).
 * Resolves with the persisted snapshot or throws an Error with the
 * user-facing message.
 */
export async function requestAddonResolution(
  bookingId: string,
  addonId: string,
  decision: "approve" | "decline",
): Promise<BookingAddonSnapshot[]> {
  const res = await fetch(`/api/admin/bookings/${bookingId}/approve-addon`, {
    ...adminApiFetchInit,
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addon_id: addonId, decision }),
  });
  let data: { error?: string; addons_snapshot?: unknown } = {};
  try {
    data = (await res.json()) as { error?: string; addons_snapshot?: unknown };
  } catch {
    data = {};
  }

  if (res.ok && Array.isArray(data.addons_snapshot)) {
    return data.addons_snapshot as BookingAddonSnapshot[];
  }

  throw new Error(typeof data.error === "string" ? data.error : "Failed to update add-on state.");
}
