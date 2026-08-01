import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
// Remediation 2.4: shared service-role client (carries the Data-Cache
// no-store workaround) instead of a route-local createClient.
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingEmail } from "@/lib/send-booking-email";
import { dispatchConfirmedStayWhatsAppNotification } from "@/lib/whatsapp/confirmed-stay-notification";
import {
  sendBookingPaymentReceivedEmail,
  sendBookingPaymentReminderEmail,
  sendBookingPaymentRequestedEmail,
} from "@/lib/send-booking-payment-email";
import { sendEventConfirmationEmail } from "@/lib/send-event-confirmation-email";
import { parseEventSetupEstimateFromMessage } from "@/lib/event-inquiry-message";
import { buildProposalEmailLineItems } from "@/lib/event-proposal-line-items";
import { sendEventProposalEmail } from "@/lib/send-event-proposal-email";
import { appendPaymentReminderNote } from "@/lib/payment-reminders";
import {
  BOOKING_PAYMENT_LIFECYCLE_STATUSES,
  REFUND_LIFECYCLE_STATUSES,
} from "@/lib/payments/domain";
import {
  isPaymentLinkProvider,
  isPaymentLinkStatus,
} from "@/lib/payments/provider";
import { validateManualRefundRecord } from "@/lib/payments/manual-refund";
import { findAvailabilityConflict } from "@/lib/calendar/availability";
import { isExclusionViolation, isMissingColumnError } from "@/lib/db-errors";
import { resolveBookingRecipient } from "@/lib/booking-recipient";

function parseStoredNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}


export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const denied = requireAdminAuth(request);
  if (denied) return denied;

  const db = supabaseAdmin;
  const payload = await request.json();
  const bookingId = params.id;
  const status = payload.status as unknown;
  const reminderRequested = payload.send_payment_reminder === true;
  const proposalSendRequested = payload.send_event_proposal === true;
  const statusUpdateProvided = Object.prototype.hasOwnProperty.call(payload, "status");
  const paymentFieldNames = [
    "payment_status",
    "payment_stage",
    "payment_method",
    "deposit_amount",
    "amount_paid",
    "amount_total",
    "amount_due",
    "payment_last_at",
    "payment_reference",
    "payment_notes",
    "payment_requested_at",
    "payment_received_at",
    "payment_due_at",
    "payment_marked_by",
    "payment_link_url",
    "payment_link_provider",
    "payment_link_expires_at",
    "payment_link_issued_at",
    "payment_link_status",
    "payment_provider_session_id",
    "refund_status",
    "refund_amount",
    "refunded_at",
    "refund_provider_reference",
  ] as const;
  const paymentUpdateProvided = paymentFieldNames.some((field) =>
    Object.prototype.hasOwnProperty.call(payload, field)
  );
  const proposalFieldNames = [
    "proposal_status",
    "proposal_total_amount",
    "proposal_deposit_amount",
    "proposal_included_services",
    "proposal_excluded_services",
    "proposal_optional_services",
    "proposal_notes",
    "proposal_valid_until",
    "proposal_payment_methods",
    "proposal_sent_at",
    "proposal_responded_at",
  ] as const;
  const proposalUpdateProvided = proposalFieldNames.some((field) =>
    Object.prototype.hasOwnProperty.call(payload, field)
  );

  if (!statusUpdateProvided && !paymentUpdateProvided && !proposalUpdateProvided && !reminderRequested && !proposalSendRequested) {
    return NextResponse.json({ error: "No booking updates provided." }, { status: 400 });
  }

  const { data: existingBooking, error: existingBookingError } = await db
    .from("bookings")
    .select("id, villa, check_in, check_out, status, sleeping_guests, day_visitors, event_type, message, addons, addons_snapshot, pricing_subtotal, pricing_snapshot, member_id, guest_name, guest_email, guest_phone, payment_status, payment_stage, payment_method, deposit_amount, amount_paid, amount_total, amount_due, payment_last_at, payment_reference, payment_due_at, payment_requested_at, payment_received_at, payment_notes, payment_link_url, payment_link_provider, payment_link_expires_at, payment_link_issued_at, payment_link_status, payment_provider_session_id, refund_status, refund_amount, refunded_at, proposal_status, proposal_total_amount, proposal_deposit_amount, proposal_included_services, proposal_excluded_services, proposal_optional_services, proposal_notes, proposal_valid_until, proposal_payment_methods, proposal_sent_at, proposal_responded_at")
    .eq("id", bookingId)
    .single();

  if (existingBookingError || !existingBooking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  if (statusUpdateProvided) {
    const allowed = ["pending", "confirmed", "cancelled"];
    if (typeof status !== "string" || !allowed.includes(status)) {
      return NextResponse.json({ error: "Invalid status value." }, { status: 400 });
    }
  }

  const isExistingEventInquiry = Boolean(
    existingBooking.event_type &&
    typeof existingBooking.message === "string" &&
    existingBooking.message.includes("[Event Inquiry]")
  );

  if (status === "confirmed") {
    try {
      const conflict = await findAvailabilityConflict(
        existingBooking.villa,
        existingBooking.check_in,
        existingBooking.check_out,
        bookingId,
        isExistingEventInquiry
      );
      if (conflict) {
        return NextResponse.json(
          { error: `Cannot confirm — ${existingBooking.villa} already has a blocked stay from ${conflict.check_in} to ${conflict.check_out} that overlaps these dates.` },
          { status: 409 }
        );
      }
    } catch (conflictErr) {
      console.error("[api/admin/bookings] conflict check error:", conflictErr);
      return NextResponse.json({ error: "Could not verify availability. Please try again." }, { status: 500 });
    }
  }

  if (reminderRequested) {
    if (existingBooking.status !== "confirmed") {
      return NextResponse.json({ error: "Payment reminders are only available for confirmed bookings." }, { status: 400 });
    }
    if ((existingBooking.payment_status?.trim() || "unpaid") !== "payment_requested") {
      return NextResponse.json({ error: "Payment reminders are only available when payment has been requested." }, { status: 400 });
    }
  }

  if (proposalSendRequested && !isExistingEventInquiry) {
    return NextResponse.json({ error: "Event proposals are only available for event inquiries." }, { status: 400 });
  }

  if (status === "confirmed" && isExistingEventInquiry && existingBooking.proposal_status !== "accepted") {
    return NextResponse.json({ error: "Wait for guest acceptance before confirming this event." }, { status: 400 });
  }

  const allowedPaymentStatuses = BOOKING_PAYMENT_LIFECYCLE_STATUSES;
  const allowedPaymentStages = ["none", "unpaid", "partially_paid", "fully_paid"];
  const allowedPaymentMethods = ["whish", "cash", "bank_transfer", "card_manual", "other"];
  const allowedRefundStatuses = REFUND_LIFECYCLE_STATUSES;
  const allowedProposalStatuses = ["draft", "sent", "accepted", "declined", "expired"];
  const updatePayload: Record<string, unknown> = {};

  if (statusUpdateProvided) {
    updatePayload.status = status;
  }

  function readOptionalText(field: (typeof paymentFieldNames)[number]) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
    const value = payload[field];
    if (value === null || value === "") {
      updatePayload[field] = null;
      return;
    }
    if (typeof value !== "string") {
      throw new Error(`Invalid ${field} value.`);
    }
    updatePayload[field] = value;
  }

  function readOptionalNumber(field: (typeof paymentFieldNames)[number]) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
    const value = payload[field];
    if (value === null || value === "") {
      updatePayload[field] = null;
      return;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid ${field} value.`);
    }
    updatePayload[field] = value;
  }

  function readOptionalTimestamp(field: (typeof paymentFieldNames)[number]) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
    const value = payload[field];
    if (value === null || value === "") {
      updatePayload[field] = null;
      return;
    }
    if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
      throw new Error(`Invalid ${field} value.`);
    }
    updatePayload[field] = value;
  }

  function readOptionalProposalText(field: (typeof proposalFieldNames)[number]) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
    const value = payload[field];
    if (value === null || value === "") {
      updatePayload[field] = null;
      return;
    }
    if (typeof value !== "string") {
      throw new Error(`Invalid ${field} value.`);
    }
    updatePayload[field] = value;
  }

  function readOptionalProposalNumber(field: (typeof proposalFieldNames)[number]) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
    const value = payload[field];
    if (value === null || value === "") {
      updatePayload[field] = null;
      return;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid ${field} value.`);
    }
    updatePayload[field] = value;
  }

  function readOptionalProposalTimestamp(field: (typeof proposalFieldNames)[number]) {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) return;
    const value = payload[field];
    if (value === null || value === "") {
      updatePayload[field] = null;
      return;
    }
    if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
      throw new Error(`Invalid ${field} value.`);
    }
    updatePayload[field] = value;
  }

  try {
    if (Object.prototype.hasOwnProperty.call(payload, "payment_status")) {
      const paymentStatus = payload.payment_status;
      if (paymentStatus === null || paymentStatus === "") {
        updatePayload.payment_status = null;
      } else if (
        typeof paymentStatus === "string" &&
        (allowedPaymentStatuses as readonly string[]).includes(paymentStatus)
      ) {
        updatePayload.payment_status = paymentStatus;
      } else {
        return NextResponse.json({ error: "Invalid payment_status value." }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "payment_stage")) {
      const paymentStage = payload.payment_stage;
      if (paymentStage === null || paymentStage === "") {
        updatePayload.payment_stage = null;
      } else if (typeof paymentStage === "string" && allowedPaymentStages.includes(paymentStage)) {
        updatePayload.payment_stage = paymentStage;
      } else {
        return NextResponse.json({ error: "Invalid payment_stage value." }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "payment_method")) {
      const paymentMethod = payload.payment_method;
      if (paymentMethod === null || paymentMethod === "") {
        updatePayload.payment_method = null;
      } else if (typeof paymentMethod === "string" && allowedPaymentMethods.includes(paymentMethod)) {
        updatePayload.payment_method = paymentMethod;
      } else {
        return NextResponse.json({ error: "Invalid payment_method value." }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "payment_link_provider")) {
      const paymentLinkProvider = payload.payment_link_provider;
      if (paymentLinkProvider === null || paymentLinkProvider === "") {
        updatePayload.payment_link_provider = null;
      } else if (isPaymentLinkProvider(paymentLinkProvider)) {
        updatePayload.payment_link_provider = paymentLinkProvider;
      } else {
        return NextResponse.json({ error: "Invalid payment_link_provider value." }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "payment_link_status")) {
      const paymentLinkStatus = payload.payment_link_status;
      if (paymentLinkStatus === null || paymentLinkStatus === "") {
        updatePayload.payment_link_status = null;
      } else if (isPaymentLinkStatus(paymentLinkStatus)) {
        updatePayload.payment_link_status = paymentLinkStatus;
      } else {
        return NextResponse.json({ error: "Invalid payment_link_status value." }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "refund_status")) {
      const refundStatus = payload.refund_status;
      if (refundStatus === null || refundStatus === "") {
        updatePayload.refund_status = null;
      } else if (
        typeof refundStatus === "string" &&
        (allowedRefundStatuses as readonly string[]).includes(refundStatus)
      ) {
        updatePayload.refund_status = refundStatus;
      } else {
        return NextResponse.json({ error: "Invalid refund_status value." }, { status: 400 });
      }
    }

    // Plan 4 Phase 1 (KNOWN_BUGS #15): refunds are executed by hand in the
    // NetCommerce Business Center — recording one here REQUIRES the Business
    // Center refund/transaction reference so the record stays traceable.
    const refundValidation = validateManualRefundRecord(payload);
    if (!refundValidation.ok) {
      return NextResponse.json({ error: refundValidation.error }, { status: 400 });
    }

    readOptionalNumber("deposit_amount");
    readOptionalNumber("amount_paid");
    readOptionalNumber("amount_total");
    readOptionalNumber("amount_due");
    readOptionalNumber("refund_amount");
    readOptionalText("refund_provider_reference");
    readOptionalText("payment_reference");
    readOptionalText("payment_notes");
    readOptionalText("payment_marked_by");
    readOptionalText("payment_link_url");
    readOptionalText("payment_provider_session_id");
    readOptionalTimestamp("payment_requested_at");
    readOptionalTimestamp("payment_received_at");
    readOptionalTimestamp("payment_last_at");
    readOptionalTimestamp("payment_due_at");
    readOptionalTimestamp("payment_link_expires_at");
    readOptionalTimestamp("payment_link_issued_at");
    readOptionalTimestamp("refunded_at");

    if (Object.prototype.hasOwnProperty.call(payload, "proposal_status")) {
      const proposalStatus = payload.proposal_status;
      if (proposalStatus === null || proposalStatus === "") {
        updatePayload.proposal_status = null;
      } else if (typeof proposalStatus === "string" && allowedProposalStatuses.includes(proposalStatus)) {
        updatePayload.proposal_status = proposalStatus;
      } else {
        return NextResponse.json({ error: "Invalid proposal_status value." }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "proposal_payment_methods")) {
      const proposalPaymentMethods = payload.proposal_payment_methods;
      if (proposalPaymentMethods === null) {
        updatePayload.proposal_payment_methods = [];
      } else if (
        Array.isArray(proposalPaymentMethods) &&
        proposalPaymentMethods.every((value) => typeof value === "string" && allowedPaymentMethods.includes(value))
      ) {
        updatePayload.proposal_payment_methods = proposalPaymentMethods;
      } else {
        return NextResponse.json({ error: "Invalid proposal_payment_methods value." }, { status: 400 });
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, "proposal_included_services")) {
      const proposalIncludedServices = payload.proposal_included_services;
      if (proposalIncludedServices === null) {
        updatePayload.proposal_included_services = [];
      } else if (Array.isArray(proposalIncludedServices)) {
        const normalized = proposalIncludedServices.map((service) => {
          if (!service || typeof service !== "object" || typeof service.label !== "string" || !service.label.trim()) {
            throw new Error("Invalid proposal_included_services value.");
          }

          const nextService: Record<string, unknown> = {
            label: service.label.trim(),
          };
          if (typeof service.id === "string" && service.id.trim()) {
            nextService.id = service.id.trim();
          }
          if (service.unit_label === null || service.unit_label === undefined || service.unit_label === "") {
            nextService.unit_label = null;
          } else if (typeof service.unit_label === "string") {
            nextService.unit_label = service.unit_label.trim();
          } else {
            throw new Error("Invalid proposal_included_services value.");
          }
          if (service.quantity === null || service.quantity === undefined || service.quantity === "") {
            nextService.quantity = null;
          } else if (typeof service.quantity === "number" && Number.isFinite(service.quantity) && service.quantity >= 0) {
            nextService.quantity = service.quantity;
          } else {
            throw new Error("Invalid proposal_included_services value.");
          }
          if (service.admin_status === undefined || service.admin_status === null || service.admin_status === "") {
            nextService.admin_status = null;
          } else if (service.admin_status === "approved" || service.admin_status === "declined") {
            nextService.admin_status = service.admin_status;
          } else {
            throw new Error("Invalid proposal_included_services value.");
          }
          // Phase 15H — line-item pricing fields. All optional; null clears.
          if (service.unit_price === null || service.unit_price === undefined || service.unit_price === "") {
            nextService.unit_price = null;
          } else if (typeof service.unit_price === "number" && Number.isFinite(service.unit_price) && service.unit_price >= 0) {
            nextService.unit_price = service.unit_price;
          } else {
            throw new Error("Invalid proposal_included_services value.");
          }
          if (service.line_total === null || service.line_total === undefined || service.line_total === "") {
            nextService.line_total = null;
          } else if (typeof service.line_total === "number" && Number.isFinite(service.line_total) && service.line_total >= 0) {
            nextService.line_total = service.line_total;
          } else {
            throw new Error("Invalid proposal_included_services value.");
          }
          if (service.source === undefined || service.source === null || service.source === "") {
            nextService.source = null;
          } else if (service.source === "requested" || service.source === "custom") {
            nextService.source = service.source;
          } else {
            throw new Error("Invalid proposal_included_services value.");
          }
          if (service.notes === undefined || service.notes === null || service.notes === "") {
            nextService.notes = null;
          } else if (typeof service.notes === "string") {
            nextService.notes = service.notes.trim() || null;
          } else {
            throw new Error("Invalid proposal_included_services value.");
          }
          return nextService;
        });
        updatePayload.proposal_included_services = normalized;
      } else {
        return NextResponse.json({ error: "Invalid proposal_included_services value." }, { status: 400 });
      }
    }

    readOptionalProposalNumber("proposal_total_amount");
    readOptionalProposalNumber("proposal_deposit_amount");
    readOptionalProposalText("proposal_excluded_services");
    readOptionalProposalText("proposal_optional_services");
    readOptionalProposalText("proposal_notes");
    readOptionalProposalTimestamp("proposal_valid_until");
    readOptionalProposalTimestamp("proposal_sent_at");
    readOptionalProposalTimestamp("proposal_responded_at");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid booking update." },
      { status: 400 }
    );
  }

  if (proposalSendRequested) {
    updatePayload.proposal_status = "sent";
    updatePayload.proposal_sent_at = new Date().toISOString();
  }

  if (proposalSendRequested) {
    const proposalTotalAmount =
      parseStoredNumber(updatePayload.proposal_total_amount) ??
      parseStoredNumber(existingBooking.proposal_total_amount);
    const proposalValidUntilRaw =
      typeof updatePayload.proposal_valid_until === "string"
        ? updatePayload.proposal_valid_until
        : typeof existingBooking.proposal_valid_until === "string"
          ? existingBooking.proposal_valid_until
          : null;
    const proposalPaymentMethodsRaw = Array.isArray(updatePayload.proposal_payment_methods)
      ? updatePayload.proposal_payment_methods
      : Array.isArray(existingBooking.proposal_payment_methods)
        ? existingBooking.proposal_payment_methods
        : [];
    const proposalPaymentMethods = proposalPaymentMethodsRaw.filter(
      (value: unknown): value is string => typeof value === "string" && value.trim().length > 0
    );

    if (proposalTotalAmount === null) {
      return NextResponse.json({ error: "Enter a proposal total before sending the proposal." }, { status: 400 });
    }
    if (!proposalValidUntilRaw || Number.isNaN(new Date(proposalValidUntilRaw).getTime())) {
      return NextResponse.json({ error: "Set a proposal validity date before sending the proposal." }, { status: 400 });
    }
    if (proposalPaymentMethods.length === 0) {
      return NextResponse.json({ error: "Choose at least one payment method before sending the proposal." }, { status: 400 });
    }
  }

  let updated = existingBooking;

  const nextStatus =
    typeof updatePayload.status === "string"
      ? updatePayload.status
      : existingBooking.status;
  const nextPaymentStatus =
    typeof updatePayload.payment_status === "string"
      ? updatePayload.payment_status
      : existingBooking.payment_status;

  if (isExistingEventInquiry && nextPaymentStatus === "payment_requested" && nextStatus !== "confirmed") {
    return NextResponse.json({ error: "Confirm the event before requesting payment." }, { status: 400 });
  }

  if (statusUpdateProvided || paymentUpdateProvided || proposalUpdateProvided || proposalSendRequested) {
    let { data, error } = await db
      .from("bookings")
      .update(updatePayload)
      .eq("id", bookingId)
      .select()
      .single();

    // Plan 4 Phase 1: tolerate the pre-migration state — while the
    // refund_provider_reference column is missing, record the refund without
    // it (the reference is still preserved inside payment_notes).
    if (
      error &&
      Object.prototype.hasOwnProperty.call(updatePayload, "refund_provider_reference") &&
      isMissingColumnError(error, "refund_provider_reference")
    ) {
      console.warn(
        "[api/admin/bookings] refund_provider_reference column missing — run sql/plan4-refund-provider-reference.sql (reference kept in payment_notes for now)",
      );
      const fallbackPayload = { ...updatePayload };
      delete fallbackPayload.refund_provider_reference;
      ({ data, error } = await db
        .from("bookings")
        .update(fallbackPayload)
        .eq("id", bookingId)
        .select()
        .single());
    }

    if (error || !data) {
      // Remediation 1.4: losing the confirm race against the DB overlap
      // constraint keeps the booking pending and surfaces the same message
      // as the pre-write availability check.
      if (isExclusionViolation(error)) {
        return NextResponse.json(
          { error: `Cannot confirm — ${existingBooking.villa} already has a confirmed stay overlapping these dates. The booking remains pending.` },
          { status: 409 }
        );
      }
      console.error("[api/admin/bookings] update error or no row matched:", error);
      return NextResponse.json(
        { error: "Booking not found or could not be updated." },
        { status: error ? 500 : 404 }
      );
    }

    updated = data;
  }

  let emailSent = false;
  const isEventInquiry = Boolean(
    updated.event_type &&
    typeof updated.message === "string" &&
    updated.message.includes("[Event Inquiry]")
  );

  if (statusUpdateProvided && (status === "confirmed" || status === "cancelled")) {
    try {
      const { email: recipientEmail, name: recipientName } = await resolveBookingRecipient(db, updated);

      if (!recipientEmail) {
        console.warn(`[api/admin/bookings] no email address for booking ${bookingId} — skipping notification`);
      } else {
        if (isEventInquiry && status === "confirmed") {
          await sendEventConfirmationEmail({
            to: recipientEmail,
            name: recipientName,
            booking_id: bookingId,
            villa: updated.villa,
            check_in: updated.check_in,
            check_out: updated.check_out,
            event_type: updated.event_type ?? null,
            proposal_total_amount: updated.proposal_total_amount ?? null,
          });
        } else {
          await sendBookingEmail({
            to: recipientEmail,
            name: recipientName,
            status: status as "confirmed" | "cancelled",
            villa: updated.villa,
            check_in: updated.check_in,
            check_out: updated.check_out,
            booking_id: bookingId,
            sleeping_guests: updated.sleeping_guests,
            day_visitors: updated.day_visitors,
            event_type: updated.event_type ?? null,
            message: updated.message ?? null,
            addons: Array.isArray(updated.addons) ? updated.addons : [],
            addons_snapshot: Array.isArray(updated.addons_snapshot) ? updated.addons_snapshot : null,
            pricing_subtotal: updated.pricing_subtotal ?? null,
            pricing_snapshot: updated.pricing_snapshot ?? null,
          });
        }
        emailSent = true;
      }
    } catch (emailErr) {
      console.error("[api/admin/bookings] email notification error:", emailErr);
    }
  }

  // Phase 16C — automatic WhatsApp Arrival Guide dispatch for confirmed STAY
  // bookings only (event inquiries use their own email path and are excluded).
  // Fail-closed and at-most-once inside the helper (env gates, phone/expired
  // skips, atomic whatsapp_confirmation_sent_at claim — an admin re-confirm
  // does not resend). Never blocks the PATCH response or the email above.
  // Audit B-3: the dispatch outcome is captured for RESPONSE REPORTING ONLY —
  // when/whether/how often the dispatch fires is unchanged.
  let whatsappOutcome: { dispatched: boolean; reason?: string } | null = null;
  if (statusUpdateProvided && status === "confirmed" && !isEventInquiry) {
    try {
      whatsappOutcome = await dispatchConfirmedStayWhatsAppNotification({
        booking_id: bookingId,
        status: "confirmed",
        villa: updated.villa,
        check_in: updated.check_in,
        check_out: updated.check_out,
        event_type: updated.event_type ?? null,
        message: updated.message ?? null,
        guest_name: updated.guest_name ?? null,
        guest_phone: updated.guest_phone ?? null,
        member_id: updated.member_id ?? null,
      });
    } catch (whatsappErr) {
      console.error("[api/admin/bookings] whatsapp dispatch unexpected error:", whatsappErr);
      whatsappOutcome = { dispatched: false, reason: "unexpected_error" };
    }
  }

  const paymentStatusChanged =
    typeof updated.payment_status === "string" &&
    updated.payment_status !== existingBooking.payment_status;

  if (paymentStatusChanged) {
    try {
      const { email: recipientEmail, name: recipientName } = await resolveBookingRecipient(db, updated);

      if (!recipientEmail) {
        console.warn(`[api/admin/bookings] no email address for booking ${bookingId} payment update — skipping notification`);
      } else if (updated.payment_status === "payment_requested") {
        await sendBookingPaymentRequestedEmail({
          to: recipientEmail,
          name: recipientName,
          villa: updated.villa,
          check_in: updated.check_in,
          check_out: updated.check_out,
          booking_id: bookingId,
          payment_status: updated.payment_status ?? null,
          deposit_amount: updated.deposit_amount ?? null,
          amount_paid: updated.amount_paid ?? null,
          payment_due_at: updated.payment_due_at ?? null,
          payment_method: updated.payment_method ?? null,
          payment_reference: updated.payment_reference ?? null,
          pricing_subtotal: updated.pricing_subtotal ?? null,
          pricing_snapshot: updated.pricing_snapshot ?? null,
          addons_snapshot: Array.isArray(updated.addons_snapshot) ? updated.addons_snapshot : null,
          event_type: updated.event_type ?? null,
          proposal_total_amount: updated.proposal_total_amount ?? null,
          is_event_inquiry: isEventInquiry,
        });
        emailSent = true;
      } else if (updated.payment_status === "deposit_paid" || updated.payment_status === "paid_in_full") {
        await sendBookingPaymentReceivedEmail({
          to: recipientEmail,
          name: recipientName,
          villa: updated.villa,
          check_in: updated.check_in,
          check_out: updated.check_out,
          booking_id: bookingId,
          payment_status: updated.payment_status ?? null,
          deposit_amount: updated.deposit_amount ?? null,
          amount_paid: updated.amount_paid ?? null,
          payment_due_at: updated.payment_due_at ?? null,
          payment_method: updated.payment_method ?? null,
          payment_reference: updated.payment_reference ?? null,
          pricing_subtotal: updated.pricing_subtotal ?? null,
          pricing_snapshot: updated.pricing_snapshot ?? null,
          addons_snapshot: Array.isArray(updated.addons_snapshot) ? updated.addons_snapshot : null,
          event_type: updated.event_type ?? null,
          proposal_total_amount: updated.proposal_total_amount ?? null,
          is_event_inquiry: isEventInquiry,
        });
        emailSent = true;
      }
    } catch (paymentEmailErr) {
      console.error("[api/admin/bookings] payment email notification error:", paymentEmailErr);
    }
  }

  if (reminderRequested) {
    try {
      const { email: recipientEmail, name: recipientName } = await resolveBookingRecipient(db, updated);

      if (!recipientEmail) {
        console.warn(`[api/admin/bookings] no email address for booking ${bookingId} reminder — skipping notification`);
      } else {
        await sendBookingPaymentReminderEmail({
          to: recipientEmail,
          name: recipientName,
          villa: updated.villa,
          check_in: updated.check_in,
          check_out: updated.check_out,
          booking_id: bookingId,
          payment_status: updated.payment_status ?? null,
          deposit_amount: updated.deposit_amount ?? null,
          amount_paid: updated.amount_paid ?? null,
          payment_due_at: updated.payment_due_at ?? null,
          payment_method: updated.payment_method ?? null,
          payment_reference: updated.payment_reference ?? null,
          pricing_subtotal: updated.pricing_subtotal ?? null,
          pricing_snapshot: updated.pricing_snapshot ?? null,
          addons_snapshot: Array.isArray(updated.addons_snapshot) ? updated.addons_snapshot : null,
          event_type: updated.event_type ?? null,
          proposal_total_amount: updated.proposal_total_amount ?? null,
          is_event_inquiry: isEventInquiry,
        });

        const reminderTimestamp = new Date().toISOString();
        const reminderNotes = appendPaymentReminderNote(updated.payment_notes ?? null, reminderTimestamp);
        const { data: remindedBooking, error: reminderUpdateError } = await db
          .from("bookings")
          .update({ payment_notes: reminderNotes })
          .eq("id", bookingId)
          .select()
          .single();

        if (reminderUpdateError || !remindedBooking) {
          console.error("[api/admin/bookings] reminder note update error:", reminderUpdateError);
        } else {
          updated = remindedBooking;
        }

        emailSent = true;
      }
    } catch (reminderErr) {
      console.error("[api/admin/bookings] payment reminder error:", reminderErr);
    }
  }

  if (proposalSendRequested && isEventInquiry) {
    try {
      const { email: recipientEmail, name: recipientName } = await resolveBookingRecipient(db, updated);

      if (!recipientEmail) {
        console.warn(`[api/admin/bookings] no email address for booking ${bookingId} proposal — skipping notification`);
      } else {
        const estimate = parseEventSetupEstimateFromMessage(
          typeof updated.message === "string" ? updated.message : "",
        );
        const includedRaw = Array.isArray(updated.proposal_included_services) ? updated.proposal_included_services : [];
        const serviceLines = buildProposalEmailLineItems(includedRaw, estimate);
        const proposalPaymentMethodsForEmail = Array.isArray(updated.proposal_payment_methods)
          ? updated.proposal_payment_methods.filter((value: unknown): value is string => typeof value === "string")
          : [];
        await sendEventProposalEmail({
          to: recipientEmail,
          name: recipientName,
          booking_id: bookingId,
          villa: updated.villa,
          check_in: updated.check_in,
          check_out: updated.check_out,
          event_type: updated.event_type ?? null,
          proposal_total_amount: updated.proposal_total_amount ?? null,
          proposal_deposit_amount: updated.proposal_deposit_amount ?? null,
          proposal_valid_until: updated.proposal_valid_until ?? null,
          proposal_payment_methods: proposalPaymentMethodsForEmail,
          service_lines: serviceLines,
        });
        emailSent = true;
      }
    } catch (proposalEmailErr) {
      console.error("[api/admin/bookings] proposal email notification error:", proposalEmailErr);
    }
  }

  return NextResponse.json({ ok: true, booking: updated, email_sent: emailSent, whatsapp: whatsappOutcome });
}
