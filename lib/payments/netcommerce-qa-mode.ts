export function parseNetCommerceQaMode(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

export function shouldBypassOrayaReviewBeforePaymentForNetCommerceQa(qaModeEnabled: boolean): boolean {
  return qaModeEnabled;
}

export function shouldConfirmBookingAfterNetCommerceQaPayment({
  qaModeEnabled,
  paymentApproved,
  bookingStatus,
}: {
  qaModeEnabled: boolean;
  paymentApproved: boolean;
  bookingStatus: string | null | undefined;
}): boolean {
  const normalizedStatus = typeof bookingStatus === "string" ? bookingStatus.trim().toLowerCase() : "";
  return qaModeEnabled && paymentApproved && normalizedStatus !== "cancelled";
}
