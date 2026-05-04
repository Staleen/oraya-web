import type { Booking, BookingAddonSnapshot } from "@/components/admin/types";

function getAddonSnapshots(booking: Booking): BookingAddonSnapshot[] {
  return booking.addons_snapshot ?? [];
}

function hasResolvedAddonStatus(addon: BookingAddonSnapshot): boolean {
  return addon.status === "approved" || addon.status === "declined";
}

function addonNeedsAttention(addon: BookingAddonSnapshot): boolean {
  if (hasResolvedAddonStatus(addon)) return false;
  return (
    addon.status === "pending_approval" ||
    addon.status === "at_risk" ||
    addon.same_day_warning === "same_day_checkout" ||
    addon.same_day_warning === "same_day_checkin"
  );
}

function bookingHasPendingAddonApproval(booking: Booking): boolean {
  return getAddonSnapshots(booking).some(
    (addon) => addon.requires_approval && addon.status === "pending_approval",
  );
}

function bookingHasOperationalAttention(booking: Booking): boolean {
  return getAddonSnapshots(booking).some((addon) => addonNeedsAttention(addon));
}

/** Pending status, pending add-on approvals, or operational attention — aligned with BookingsTable “requires action”. */
export function adminBookingRequiresAction(booking: Booking): boolean {
  if (booking.status === "cancelled") return false;
  return (
    booking.status === "pending" ||
    bookingHasPendingAddonApproval(booking) ||
    bookingHasOperationalAttention(booking)
  );
}
