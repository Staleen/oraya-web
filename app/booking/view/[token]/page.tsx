import Link from "next/link";
import PublicTrustShell from "@/components/PublicTrustShell";
import { AddonIcon } from "@/components/addon-icon";
import CopyValueButton from "@/components/CopyValueButton";
import { BookingViewMemberLink } from "@/components/BookingViewMemberLink";
import { buildProposalEmailLineItems } from "@/lib/event-proposal-line-items";
import { extractEventInquiryGuestNotesLine, parseEventSetupEstimateFromMessage } from "@/lib/event-inquiry-message";
import { derivePaymentLinkState } from "@/lib/payments/link-state";
import type {
  BookingPaymentLifecycleStatus,
  HostedSessionLifecycleStatus,
  RefundLifecycleStatus,
} from "@/lib/payments/domain";
import type { PaymentLinkProvider } from "@/lib/payments/provider";
import { formatPaymentMethodLabel } from "@/lib/payment-method-labels";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyViewToken } from "@/lib/booking-action-token";
import {
  bookingWhatsAppChangePrefill,
  bookingWhatsAppPrefill,
  CANCELLATION_HINT,
  REFUND_POLICY_HREF,
  VIEW_CHANGE_CANCEL_BODY,
  VIEW_CHANGE_CANCEL_TITLE,
  VIEW_CONFIRMED_LINES,
  VIEW_PENDING_LINES,
  VIEW_REFUND_POLICY_LINK_LABEL,
  viewStatusHeadline,
  type BookingViewStatusNorm,
  WHATSAPP_SUPPORT_LINE,
} from "@/lib/booking-trust-messaging";

const GOLD        = "var(--oraya-gold)";
const WHITE       = "var(--oraya-book-heading)";
const GOLD_CTA    = "var(--oraya-gold-cta-text)";
const MUTED       = "var(--oraya-book-muted)";
const BOOK_P82    = "var(--oraya-book-p82)";
const BOOK_SUBTLE = "var(--oraya-book-subtle-line)";
const GLASS1      = "var(--oraya-book-surface-1)";
const GLASS3      = "var(--oraya-book-surface-3)";
const GLG3        = "var(--oraya-book-surface-gold-3)";
const GLG4        = "var(--oraya-book-surface-gold-4)";
const PLAYFAIR = "'Playfair Display', Georgia, serif";
const LATO     = "'Lato', system-ui, sans-serif";

export const dynamic = "force-dynamic";

type Addon = {
  id?: string;
  label?: string;
  price?: number | null;
  preparation_time_hours?: number | null;
  requires_approval?: boolean;
  status?: string | null;
  same_day_warning?: "same_day_checkout" | "same_day_checkin" | null;
};

type ProposalIncludedService = {
  id?: string | null;
  label: string;
  quantity?: number | null;
  unit_label?: string | null;
  admin_status?: string | null;
};

interface BookingRow {
  id:               string;
  villa:            string;
  check_in:         string;
  check_out:        string;
  sleeping_guests:  number | null;
  day_visitors:     number | null;
  event_type:       string | null;
  message:          string | null;
  addons:           Addon[] | null;
  addons_snapshot:  Addon[] | null;
  pricing_subtotal: number | string | null;
  pricing_snapshot: { subtotal?: number | string | null; bedrooms_to_be_used?: number | null } | null;
  status:           string;
  guest_name:       string | null;
  member_id:        string | null;
  payment_status:   BookingPaymentLifecycleStatus | null;
  deposit_amount:   number | string | null;
  amount_paid:      number | string | null;
  payment_method:   string | null;
  payment_reference:string | null;
  payment_requested_at: string | null;
  payment_received_at: string | null;
  payment_due_at:   string | null;
  payment_link_url: string | null;
  payment_link_provider: PaymentLinkProvider | null;
  payment_link_expires_at: string | null;
  payment_link_issued_at: string | null;
  payment_link_status: HostedSessionLifecycleStatus | null;
  refund_status:    RefundLifecycleStatus | null;
  refund_amount:    number | string | null;
  refunded_at:      string | null;
  proposal_status: string | null;
  proposal_total_amount: number | string | null;
  proposal_deposit_amount: number | string | null;
  proposal_included_services: ProposalIncludedService[] | null;
  proposal_excluded_services: string | null;
  proposal_optional_services: string | null;
  proposal_notes: string | null;
  proposal_valid_until: string | null;
  proposal_payment_methods: string[] | null;
  proposal_sent_at: string | null;
  proposal_responded_at: string | null;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function statusVisual(
  status: string,
  opts?: { isEventInquiry?: boolean; proposalStatus?: string | null },
): { label: string; color: string; bg: string } {
  const s = status.toLowerCase();
  if (opts?.isEventInquiry && s === "pending" && opts.proposalStatus === "accepted") {
    return {
      label: "Proposal accepted · Awaiting confirmation",
      color: "#7ecfcf",
      bg: "rgba(126,207,207,0.15)",
    };
  }
  if (s === "confirmed") return { label: "Confirmed", color: "#6fcf8a", bg: "rgba(111,207,138,0.15)" };
  if (s === "cancelled") return { label: "Cancelled", color: "#e07070", bg: "rgba(224,112,112,0.15)" };
  return { label: "Pending", color: GOLD, bg: "rgba(197,164,109,0.15)" };
}

function formatAddonPrice(price: number | null | undefined): string {
  if (typeof price !== "number") return "Price on request";
  return `$${price.toLocaleString("en-US")}`;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMoney(value: number): string {
  return `USD ${Math.round(value).toLocaleString("en-US")}`;
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Beirut",
  }).format(parsed);
}

type GuestPaymentTone = {
  color: string;
  bg: string;
  border: string;
};

type GuestPaymentPresentation = {
  label: string;
  headline: string;
  body: string;
  tone: GuestPaymentTone;
  actionUrl: string | null;
  actionLabel: string | null;
  rows: Array<[string, string]>;
  isPaid: boolean;
};

function paymentPresentationTone(kind: "pending" | "deposit" | "paid" | "attention"): GuestPaymentTone {
  if (kind === "paid") {
    return { color: "#6fcf8a", bg: "rgba(111,207,138,0.15)", border: "rgba(111,207,138,0.28)" };
  }
  if (kind === "deposit") {
    return { color: "#9db7d9", bg: "rgba(157,183,217,0.14)", border: "rgba(157,183,217,0.26)" };
  }
  if (kind === "attention") {
    return { color: "#f0bd67", bg: "rgba(224,112,112,0.08)", border: "rgba(224,112,112,0.24)" };
  }
  return { color: GOLD, bg: "rgba(197,164,109,0.14)", border: "rgba(197,164,109,0.28)" };
}

function appendPaymentDetail(rows: Array<[string, string]>, label: string, value: string | null | undefined) {
  if (value && value.trim()) {
    rows.push([label, value]);
  }
}

function buildGuestPaymentPresentation(input: {
  paymentStatus: BookingPaymentLifecycleStatus | null;
  paymentLinkStatus: HostedSessionLifecycleStatus;
  paymentLinkUrl: string | null;
  hasActivePaymentLink: boolean;
  paymentLinkExpiresAt: string | null;
  depositAmount: number | null;
  amountPaid: number | null;
  balanceDue: number | null;
  paymentDueAt: string | null;
  paymentRequestedAt: string | null;
  paymentReceivedAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
}): GuestPaymentPresentation {
  const rows: Array<[string, string]> = [];
  const method = input.paymentMethod?.replaceAll("_", " ") ?? null;
  const reference = input.paymentReference?.trim() ?? null;

  if (input.paymentStatus === "paid_in_full") {
    appendPaymentDetail(rows, "Amount paid", input.amountPaid !== null ? formatMoney(input.amountPaid) : null);
    appendPaymentDetail(rows, "Method", method);
    appendPaymentDetail(rows, "Reference", reference);
    appendPaymentDetail(rows, "Received on", input.paymentReceivedAt);
    return {
      label: "Paid in full",
      headline: "Paid in full",
      body: "Payment has been recorded for this booking.",
      tone: paymentPresentationTone("paid"),
      actionUrl: null,
      actionLabel: null,
      rows,
      isPaid: true,
    };
  }

  if (input.paymentStatus === "deposit_paid") {
    appendPaymentDetail(rows, "Amount paid", input.amountPaid !== null ? formatMoney(input.amountPaid) : null);
    appendPaymentDetail(
      rows,
      "Remaining balance",
      input.balanceDue !== null ? formatMoney(input.balanceDue) : null,
    );
    appendPaymentDetail(rows, "Method", method);
    appendPaymentDetail(rows, "Reference", reference);
    appendPaymentDetail(rows, "Received on", input.paymentReceivedAt);
    return {
      label: "Deposit paid",
      headline: "Deposit paid",
      body: "Your deposit has been recorded. Oraya will confirm any remaining balance directly.",
      tone: paymentPresentationTone("deposit"),
      actionUrl: null,
      actionLabel: null,
      rows,
      isPaid: true,
    };
  }

  if (input.paymentLinkStatus === "expired") {
    return {
      label: "Payment link expired",
      headline: "Payment link expired",
      body: "No payment has been collected yet. Oraya will send a fresh secure payment link when it is ready.",
      tone: paymentPresentationTone("attention"),
      actionUrl: null,
      actionLabel: null,
      rows,
      isPaid: false,
    };
  }

  if (input.paymentLinkStatus === "failed" || input.paymentLinkStatus === "cancelled") {
    return {
      label: "Payment could not be completed",
      headline: "Payment could not be completed",
      body: "No payment has been collected yet. Oraya will send a fresh secure payment link when it is ready.",
      tone: paymentPresentationTone("attention"),
      actionUrl: null,
      actionLabel: null,
      rows,
      isPaid: false,
    };
  }

  if (input.hasActivePaymentLink && input.paymentLinkUrl) {
    appendPaymentDetail(rows, "Link expires", input.paymentLinkExpiresAt);
    appendPaymentDetail(rows, "Deposit amount", input.depositAmount !== null ? formatMoney(input.depositAmount) : null);
    appendPaymentDetail(rows, "Due date", input.paymentDueAt);
    appendPaymentDetail(rows, "Requested on", input.paymentRequestedAt);
    return {
      label: "Payment pending",
      headline: "Secure payment link ready",
      body: "Your secure payment link is ready. You will complete payment on Oraya's hosted payment page.",
      tone: paymentPresentationTone("pending"),
      actionUrl: input.paymentLinkUrl,
      actionLabel: "Continue to secure payment",
      rows,
      isPaid: false,
    };
  }

  if (input.paymentLinkStatus === "paid") {
    return {
      label: "Payment pending",
      headline: "Payment is being verified",
      body: "Your payment was submitted. Oraya will show it as received only after provider approval is recorded.",
      tone: paymentPresentationTone("pending"),
      actionUrl: null,
      actionLabel: null,
      rows,
      isPaid: false,
    };
  }

  if (input.paymentStatus === "payment_requested") {
    appendPaymentDetail(rows, "Deposit amount", input.depositAmount !== null ? formatMoney(input.depositAmount) : null);
    appendPaymentDetail(rows, "Due date", input.paymentDueAt);
    appendPaymentDetail(rows, "Requested on", input.paymentRequestedAt);
  }

  return {
    label: "Payment pending",
    headline: "Payment pending",
    body: "No payment has been collected yet. Oraya will send your secure payment link when it is ready.",
    tone: paymentPresentationTone("pending"),
    actionUrl: null,
    actionLabel: null,
    rows,
    isPaid: false,
  };
}

function paymentReturnMessage(
  state: string | null,
  payment: GuestPaymentPresentation,
): { text: string; tone: "success" | "neutral" } | null {
  if (!state) return null;
  if (state === "success") {
    return payment.isPaid
      ? { text: "Payment received successfully.", tone: "success" }
      : { text: "Your payment was submitted. Oraya is verifying it now.", tone: "neutral" };
  }
  if (state === "cancelled") {
    return { text: "Payment was not completed. No payment has been collected yet.", tone: "neutral" };
  }
  if (state === "pending" || state === "setup_failed") {
    return {
      text: "Your booking request is in. No payment has been collected yet. Oraya will send your secure payment link when it is ready.",
      tone: "neutral",
    };
  }
  return null;
}

function formatProposalIncludedService(service: ProposalIncludedService) {
  if (typeof service.quantity === "number" && Number.isFinite(service.quantity) && service.quantity > 0) {
    return `${service.label} - ${service.quantity}${service.unit_label ? ` ${service.unit_label}` : ""}`;
  }
  return `${service.label} - requested`;
}

function isProposalExpired(status: string | null | undefined, validUntil: string | null | undefined) {
  if (status !== "sent" || !validUntil) return false;
  const parsed = new Date(validUntil);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

function sumAddonPrices(addons: Addon[]): number | null {
  if (addons.length === 0) return 0;
  let total = 0;
  for (const addon of addons) {
    if (typeof addon.price !== "number") return null;
    total += addon.price;
  }
  return total;
}

function formatAdvanceNotice(hours: number | null | undefined): string | null {
  if (!hours || hours <= 0) return null;
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} ${days === 1 ? "day" : "days"} advance notice`;
  }
  return `${hours} ${hours === 1 ? "hour" : "hours"} advance notice`;
}

function addonStatusLabel(addon: Addon): { text: string; color: string; bg: string } | null {
  if (addon.status === "approved") return { text: "Approved", color: "#6fcf8a", bg: "rgba(111,207,138,0.14)" };
  if (addon.status === "declined") return { text: "Declined", color: "#e07070", bg: "rgba(224,112,112,0.14)" };
  if (addon.status === "pending_approval" || addon.requires_approval) {
    return { text: "Subject to confirmation", color: GOLD, bg: "rgba(197,164,109,0.12)" };
  }
  if (addon.status === "at_risk") return { text: "Needs review", color: GOLD, bg: "rgba(197,164,109,0.12)" };
  return null;
}

function sameDayWarningText(value: Addon["same_day_warning"]): string | null {
  if (value === "same_day_checkout") return "May depend on same-day checkout timing.";
  if (value === "same_day_checkin") return "May depend on same-day check-in timing.";
  return null;
}

function whatsappDigits(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const d = phone.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

async function getContactSettings(): Promise<{ whatsappNumber: string | null; whishNumber: string | null }> {
  try {
    const { data } = await supabaseAdmin
      .from("settings")
      .select("key, value")
      .in("key", ["whatsapp_number", "whish_number"]);

    const settings = Array.isArray(data) ? data : [];
    return {
      whatsappNumber: settings.find((item) => item.key === "whatsapp_number")?.value ?? null,
      whishNumber: settings.find((item) => item.key === "whish_number")?.value ?? null,
    };
  } catch {
    return { whatsappNumber: null, whishNumber: null };
  }
}

function ErrorShell({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <PublicTrustShell mainStyle={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: "520px", textAlign: "center" }}>
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2rem", opacity: 0.6 }} />
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
          Booking Link
        </p>
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2rem", fontWeight: 400, color: WHITE, margin: "0 0 1rem", lineHeight: 1.2 }}>
          {title}
        </h1>
        <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, lineHeight: 1.8, marginBottom: "2.5rem" }}>
          {subtitle}
        </p>
        <Link
          href="/"
          style={{
            display:        "inline-block",
            fontFamily:     LATO,
            fontSize:       "11px",
            letterSpacing:  "2.5px",
            textTransform:  "uppercase",
            color:          GOLD_CTA,
            backgroundColor: GOLD,
            padding:        "15px 36px",
            textDecoration: "none",
          }}
        >
          Back to home
        </Link>
      </div>
    </PublicTrustShell>
  );
}

export default async function BookingViewPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { proposal?: string; payment?: string };
}) {
  const verified = verifyViewToken(decodeURIComponent(params.token));

  if (!verified.ok) {
    if (verified.reason === "expired") {
      return (
        <ErrorShell
          title="This link has expired."
          subtitle="For the latest on your booking, please reach out to us directly and we'll help you out."
        />
      );
    }
    return (
      <ErrorShell
        title="This link isn't valid."
        subtitle="The booking link you used could not be verified. Please check the link in your email or contact us if you need help."
      />
    );
  }

  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, villa, check_in, check_out, sleeping_guests, day_visitors, event_type, message, addons, addons_snapshot, pricing_subtotal, pricing_snapshot, status, guest_name, member_id, payment_status, deposit_amount, amount_paid, payment_method, payment_reference, payment_requested_at, payment_received_at, payment_due_at, payment_link_url, payment_link_provider, payment_link_expires_at, payment_link_issued_at, payment_link_status, refund_status, refund_amount, refunded_at, proposal_status, proposal_total_amount, proposal_deposit_amount, proposal_included_services, proposal_excluded_services, proposal_optional_services, proposal_notes, proposal_valid_until, proposal_payment_methods, proposal_sent_at, proposal_responded_at")
    .eq("id", verified.booking_id)
    .single<BookingRow>();

  if (error || !booking) {
    return (
      <ErrorShell
        title="We couldn't find this booking."
        subtitle="This booking may have been removed. Please contact us if you believe this is an error."
      />
    );
  }

  const { whatsappNumber } = await getContactSettings();
  const waLinkDigits = whatsappDigits(whatsappNumber);
  const ref = booking.id.slice(0, 8).toUpperCase();
  // Phase 13I: detect event inquiry — both conditions required (event_type set + structured notes marker).
  const isEventInquiry =
    !!booking.event_type &&
    typeof booking.message === "string" &&
    booking.message.includes("[Event Inquiry]");
  const visual = statusVisual(booking.status, { isEventInquiry, proposalStatus: booking.proposal_status });
  const statusNorm: BookingViewStatusNorm =
    booking.status.toLowerCase() === "confirmed"
      ? "confirmed"
      : booking.status.toLowerCase() === "cancelled"
        ? "cancelled"
        : "pending";
  const trustStatusHeadline = viewStatusHeadline(isEventInquiry, statusNorm);
  // Phase 16C Stage 2 — the private Arrival Guide exists for the two villas;
  // the link renders for confirmed bookings only and reuses this page's token.
  const arrivalGuideVilla = ["villa mechmech", "villa byblos"].includes(
    (booking.villa ?? "").trim().toLowerCase(),
  );
  // Phase 13I: bedroom setup label (stay bookings only) from snapshot persisted in 13H.
  const bedroomsRaw = booking.pricing_snapshot?.bedrooms_to_be_used;
  const bedroomLabel =
    typeof bedroomsRaw === "number" && bedroomsRaw >= 1 && bedroomsRaw <= 3
      ? `${bedroomsRaw} ${bedroomsRaw === 1 ? "bedroom" : "bedrooms"}`
      : null;
  const addons = Array.isArray(booking.addons_snapshot) && booking.addons_snapshot.length > 0
    ? booking.addons_snapshot
    : Array.isArray(booking.addons)
      ? booking.addons
      : [];
  const staySubtotal = parseAmount(booking.pricing_snapshot?.subtotal ?? booking.pricing_subtotal);
  const addonsTotal = sumAddonPrices(addons);
  const depositAmount = parseAmount(booking.deposit_amount);
  const amountPaid = parseAmount(booking.amount_paid);
  const refundAmount = parseAmount(booking.refund_amount);
  const paymentRequestedAt = formatDateTime(booking.payment_requested_at);
  const paymentReceivedAt = formatDateTime(booking.payment_received_at);
  const paymentDueAt = formatDateTime(booking.payment_due_at);
  const paymentLinkState = derivePaymentLinkState({
    payment_link_status: booking.payment_link_status,
    payment_link_expires_at: booking.payment_link_expires_at,
    payment_link_provider: booking.payment_link_provider,
    payment_link_url: booking.payment_link_url,
    payment_status: booking.payment_status,
  });
  const paymentLinkStatus = paymentLinkState.status;
  const paymentLinkExpiresAt = formatDateTime(paymentLinkState.expires_at);
  const hasActivePaymentLink = paymentLinkStatus === "active" && paymentLinkState.has_url;
  const refundedAt = formatDateTime(booking.refunded_at);
  const proposalValidUntil = formatDateTime(booking.proposal_valid_until);
  const proposalSentAt = formatDateTime(booking.proposal_sent_at);
  const proposalTotal = parseAmount(booking.proposal_total_amount);
  const proposalDeposit = parseAmount(booking.proposal_deposit_amount);
  const estimatedTotal = isEventInquiry
    ? proposalTotal
    : staySubtotal !== null && addonsTotal !== null
      ? staySubtotal + addonsTotal
      : null;
  const balanceDue =
    estimatedTotal !== null
      ? Math.max(0, estimatedTotal - (amountPaid ?? 0))
      : null;
  // Phase 15H — guests only see services the admin actually included (admin_status === "approved" or unset).
  // Declined lines stay persisted for admin audit but never surface here.
  const proposalIncludedServices = (Array.isArray(booking.proposal_included_services) ? booking.proposal_included_services : [])
    .filter((service) => service?.admin_status !== "declined");
  const proposalPaymentMethods = Array.isArray(booking.proposal_payment_methods) ? booking.proposal_payment_methods : [];
  const proposalPricingRows = buildProposalEmailLineItems(
    proposalIncludedServices,
    parseEventSetupEstimateFromMessage(booking.message),
  );
  const eventGuestNotes = isEventInquiry ? extractEventInquiryGuestNotesLine(booking.message) : null;
  const showEventProposal = isEventInquiry && booking.proposal_status === "sent";
  const proposalExpired = isProposalExpired(booking.proposal_status, booking.proposal_valid_until);
  const canRespondToProposal = showEventProposal && !proposalExpired;
  const proposalState = typeof searchParams?.proposal === "string" ? searchParams.proposal : null;
  const paymentReturnState = typeof searchParams?.payment === "string" ? searchParams.payment : null;
  const paymentOverdue =
    booking.payment_status === "payment_requested" &&
    Boolean(booking.payment_due_at) &&
    !Number.isNaN(new Date(booking.payment_due_at ?? "").getTime()) &&
    new Date(booking.payment_due_at ?? "").getTime() < Date.now();
  const stayPaymentPresentation = buildGuestPaymentPresentation({
    paymentStatus: booking.payment_status,
    paymentLinkStatus,
    paymentLinkUrl: paymentLinkState.url,
    hasActivePaymentLink,
    paymentLinkExpiresAt,
    depositAmount,
    amountPaid,
    balanceDue,
    paymentDueAt,
    paymentRequestedAt,
    paymentReceivedAt,
    paymentMethod: booking.payment_method,
    paymentReference: booking.payment_reference,
  });
  const paymentReturn = paymentReturnMessage(paymentReturnState, stayPaymentPresentation);
  const paymentRows: Array<[string, string, boolean]> = [
    ["Stay subtotal", staySubtotal !== null ? formatMoney(staySubtotal) : "Not available", false],
    ["Add-ons total", addonsTotal !== null ? formatMoney(addonsTotal) : "Price on request", false],
    ["Estimated booking total", estimatedTotal !== null ? formatMoney(estimatedTotal) : "Not available", true],
  ];

  const rows: Array<{ label: string; value: string }> = [
    { label: "Villa",        value: booking.villa },
    { label: "Check-in",     value: fmtDate(booking.check_in) },
    { label: "Check-out",    value: fmtDate(booking.check_out) },
    ...(!isEventInquiry && bedroomLabel
      ? [{ label: "Bedroom setup", value: bedroomLabel }]
      : []),
    { label: isEventInquiry ? "Overnight hosts" : "Guests staying", value: String(booking.sleeping_guests ?? "—") },
    { label: isEventInquiry ? "Expected attendees" : "Expected visitors", value: String(booking.day_visitors ?? 0) },
    ...(booking.event_type ? [{ label: "Event type", value: booking.event_type }] : []),
  ];

  return (
    <PublicTrustShell mainStyle={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: "520px", textAlign: "center" }}>
        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2rem", opacity: 0.6 }} />

        {/* Eyebrow */}
        <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "4px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
          {isEventInquiry ? "Your Event Inquiry" : "Your Booking"}
        </p>

        {/* Heading */}
        <h1 style={{ fontFamily: PLAYFAIR, fontSize: "2.2rem", fontWeight: 400, color: WHITE, margin: "0 0 1rem", lineHeight: 1.25 }}>
          {booking.villa}
        </h1>

        <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: MUTED, margin: "0 0 10px" }}>
          Booking status
        </p>
        {/* Status pill */}
        <div
          style={{
            display:        "inline-block",
            fontFamily:     LATO,
            fontSize:       "10px",
            letterSpacing:  "1.5px",
            textTransform:  "uppercase",
            color:          visual.color,
            backgroundColor: visual.bg,
            padding:        "6px 14px",
            marginBottom:   "1.5rem",
          }}
        >
          {visual.label}
        </div>

        {trustStatusHeadline && (
          <>
            <p style={{ fontFamily: PLAYFAIR, fontSize: "1.35rem", fontWeight: 400, color: WHITE, margin: "0 0 14px", lineHeight: 1.35 }}>
              {trustStatusHeadline}
            </p>
            <div
              style={{
                border: "0.5px solid rgba(197,164,109,0.22)",
                backgroundColor: "rgba(197,164,109,0.05)",
                padding: "14px 16px",
                marginBottom: "1.25rem",
                textAlign: "left",
                display: "grid",
                gap: "10px",
              }}
            >
              {(statusNorm === "confirmed" ? VIEW_CONFIRMED_LINES : VIEW_PENDING_LINES).map((line) => (
                <p key={line} style={{ fontFamily: LATO, fontSize: "13px", color: "var(--oraya-book-p78)", margin: 0, lineHeight: 1.65 }}>
                  {line}
                </p>
              ))}
              <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                {WHATSAPP_SUPPORT_LINE}
              </p>
            </div>
          </>
        )}

        {statusNorm === "cancelled" && (
          <p style={{ fontFamily: LATO, fontSize: "13px", color: "var(--oraya-book-p78)", margin: "0 0 1.25rem", lineHeight: 1.65 }}>
            This booking has been cancelled. Contact us if you need help.
          </p>
        )}

        {/* Phase 16C Stage 2 — private Arrival Guide link (confirmed bookings only) */}
        {statusNorm === "confirmed" && arrivalGuideVilla && (
          <div
            style={{
              border: "0.5px solid rgba(197,164,109,0.22)",
              backgroundColor: "rgba(197,164,109,0.05)",
              padding: "16px",
              marginBottom: "1.25rem",
              textAlign: "center",
              display: "grid",
              gap: "12px",
              justifyItems: "center",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "10px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
              Your Arrival Guide
            </p>
            <p style={{ fontFamily: LATO, fontSize: "13px", color: "var(--oraya-book-p78)", margin: 0, lineHeight: 1.65 }}>
              Directions, arrival steps and everything for the drive and the door — on one mobile page.
            </p>
            <a
              href={`/arrival/${encodeURIComponent(params.token)}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: LATO,
                fontSize: "11px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: GOLD_CTA,
                backgroundColor: GOLD,
                padding: "14px 18px",
                textDecoration: "none",
                width: "fit-content",
              }}
            >
              Open your Arrival Guide
            </a>
          </div>
        )}

        {/* Reference — prominent */}
        <div
          style={{
            border: "0.5px solid var(--oraya-book-input-border)",
            backgroundColor: GLG4,
            padding: "1.25rem 1.5rem",
            marginBottom: "2rem",
            textAlign: "center",
          }}
        >
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: "0 0 10px" }}>
            Booking reference
          </p>
          <p style={{ fontFamily: PLAYFAIR, fontSize: "1.65rem", color: WHITE, margin: "0 0 12px", letterSpacing: "2px" }}>
            {ref}
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <CopyValueButton value={ref} buttonLabel="Copy reference" />
          </div>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, lineHeight: 1.6, margin: "12px 0 0" }}>
            Use this reference in emails or messages to Oraya about this request.
          </p>
        </div>

        {/* Gold rule */}
        <div style={{ width: "40px", height: "0.5px", backgroundColor: GOLD, margin: "0 auto 2.5rem", opacity: 0.4 }} />

        {isEventInquiry && proposalState && (
          <div
            style={{
              border:
                proposalState === "accepted"
                  ? "0.5px solid rgba(111,207,138,0.28)"
                  : proposalState === "declined" || proposalState === "expired"
                    ? "0.5px solid rgba(224,112,112,0.28)"
                    : "0.5px solid var(--oraya-border)",
              backgroundColor:
                proposalState === "accepted"
                  ? "rgba(111,207,138,0.08)"
                  : proposalState === "declined" || proposalState === "expired"
                    ? "rgba(224,112,112,0.08)"
                    : GLG3,
              padding: "14px 16px",
              marginBottom: "2rem",
              textAlign: "left",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "12px", color: proposalState === "accepted" ? "#6fcf8a" : proposalState === "declined" || proposalState === "expired" ? "#f2a7a7" : WHITE, lineHeight: 1.7, margin: 0 }}>
              {proposalState === "accepted"
                ? "You accepted this proposal."
                : proposalState === "declined"
                  ? "You declined this proposal."
                  : proposalState === "expired"
                    ? "This proposal has expired."
                    : "Proposal response updated."}
            </p>
          </div>
        )}

        {/* Details card */}
        <div style={{ border: "0.5px solid var(--oraya-border)", padding: "2rem", marginBottom: "2rem", textAlign: "left" }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "1.25rem" }}>
            {isEventInquiry ? "Inquiry summary" : "Booking summary"}
          </p>
          {rows.map(({ label, value }) => (
            <div
              key={label}
              style={{
                display:        "flex",
                justifyContent: "space-between",
                alignItems:     "baseline",
                padding:        "10px 0",
                borderBottom: `0.5px solid ${BOOK_SUBTLE}`,
                gap:            "16px",
              }}
            >
              <span style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, flexShrink: 0 }}>
                {label}
              </span>
              <span style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, fontWeight: 300, textAlign: "right" }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Add-ons card — hide on event inquiries with no addons (event services live in the notes block) */}
        {!(isEventInquiry && addons.length === 0) && (
        <div style={{ border: "0.5px solid var(--oraya-border)", padding: "1.75rem", marginBottom: "2rem", textAlign: "left", backgroundColor: GLASS3 }}>
          <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
            Add-ons
          </p>
          {addons.length === 0 ? (
            <p style={{ fontFamily: LATO, fontSize: "13px", color: MUTED, margin: 0, lineHeight: 1.7 }}>
              No add-ons selected.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {addons.map((addon, index) => {
                const status = addonStatusLabel(addon);
                const notice = formatAdvanceNotice(addon.preparation_time_hours);
                const warning = sameDayWarningText(addon.same_day_warning);
                return (
                  <div
                    key={`${addon.id ?? addon.label ?? "addon"}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "14px",
                      padding: "12px 0",
                      borderBottom: index === addons.length - 1 ? "none" : `0.5px solid ${BOOK_SUBTLE}`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0 }}>
                      <AddonIcon label={addon.label ?? "Add-on"} size={17} color="var(--oraya-gold)" />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, margin: "0 0 4px", lineHeight: 1.4 }}>
                          {addon.label ?? "Add-on"}
                        </p>
                        <p style={{ fontFamily: LATO, fontSize: "12px", color: GOLD, margin: "0 0 4px", lineHeight: 1.4 }}>
                          {formatAddonPrice(addon.price)}
                        </p>
                        {(notice || warning) && (
                          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: 0, lineHeight: 1.55 }}>
                            {[notice, warning].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                    {status && (
                      <span
                        style={{
                          fontFamily: LATO,
                          fontSize: "9px",
                          letterSpacing: "1.3px",
                          textTransform: "uppercase",
                          color: status.color,
                          backgroundColor: status.bg,
                          padding: "5px 8px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {status.text}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {/* Phase 13I: pricing block — stay bookings see Payment summary; event inquiries see no pricing */}
        {isEventInquiry ? (
          showEventProposal || booking.proposal_status === "accepted" || booking.proposal_status === "declined" ? (
            <div style={{ border: "0.5px solid var(--oraya-border)", padding: "1.75rem", marginBottom: "2rem", textAlign: "left", backgroundColor: GLG3 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", marginBottom: "1rem" }}>
                <div>
                  <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "0.75rem" }}>
                    Event proposal
                  </p>
                  <p style={{ fontFamily: PLAYFAIR, fontSize: "1.2rem", color: WHITE, margin: 0 }}>
                    {booking.proposal_status === "accepted"
                      ? "Proposal accepted"
                      : booking.proposal_status === "declined"
                        ? "Proposal declined"
                        : proposalExpired
                          ? "Proposal expired"
                          : "Your custom proposal is ready"}
                  </p>
                </div>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: LATO,
                    fontSize: "10px",
                    letterSpacing: "1.5px",
                    textTransform: "uppercase",
                    color:
                      booking.proposal_status === "accepted"
                        ? "#6fcf8a"
                        : booking.proposal_status === "declined" || proposalExpired
                          ? "#f2a7a7"
                          : GOLD,
                    backgroundColor:
                      booking.proposal_status === "accepted"
                        ? "rgba(111,207,138,0.15)"
                        : booking.proposal_status === "declined" || proposalExpired
                          ? "rgba(224,112,112,0.12)"
                          : "rgba(197,164,109,0.14)",
                    border:
                      booking.proposal_status === "accepted"
                        ? "0.5px solid rgba(111,207,138,0.28)"
                        : booking.proposal_status === "declined" || proposalExpired
                          ? "0.5px solid rgba(224,112,112,0.28)"
                          : "0.5px solid var(--oraya-book-input-border)",
                    padding: "6px 12px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {booking.proposal_status === "accepted"
                    ? "Accepted"
                    : booking.proposal_status === "declined"
                      ? "Declined"
                      : proposalExpired
                        ? "Expired"
                        : "Proposal sent"}
                </span>
              </div>

              <div style={{ display: "grid", gap: "10px" }}>
                {proposalTotal !== null && (
                  <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, lineHeight: 1.6, margin: 0 }}>
                    Final event total: <span style={{ color: GOLD }}>{formatMoney(proposalTotal)}</span>
                  </p>
                )}
                {proposalDeposit !== null && (
                  <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, lineHeight: 1.6, margin: 0 }}>
                    Deposit required: <span style={{ color: GOLD }}>{formatMoney(proposalDeposit)}</span>
                  </p>
                )}
                {proposalTotal !== null && proposalDeposit !== null && proposalTotal - proposalDeposit > 0 && (
                  <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, lineHeight: 1.6, margin: 0 }}>
                    Balance due: <span style={{ color: GOLD }}>{formatMoney(proposalTotal - proposalDeposit)}</span>
                  </p>
                )}

                {proposalPricingRows.length > 0 && (
                  <div style={{ borderTop: `0.5px solid ${BOOK_SUBTLE}`, marginTop: "14px", paddingTop: "14px" }}>
                    <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "0 0 10px" }}>
                      Pricing
                    </p>
                    <div style={{ display: "grid", gap: "0" }}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto auto auto",
                          gap: "8px",
                          padding: "6px 0",
                          borderBottom: `0.5px solid ${BOOK_SUBTLE}`,
                          fontFamily: LATO,
                          fontSize: "10px",
                          letterSpacing: "1.5px",
                          textTransform: "uppercase",
                          color: MUTED,
                        }}
                      >
                        <span>Service</span>
                        <span style={{ textAlign: "right" }}>Qty</span>
                        <span style={{ textAlign: "right" }}>Unit</span>
                        <span style={{ textAlign: "right" }}>Subtotal</span>
                      </div>
                      {proposalPricingRows.map((row, idx) => (
                        <div
                          key={`${row.label}-${idx}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto auto auto",
                            gap: "8px",
                            padding: "10px 0",
                            borderBottom:
                              idx === proposalPricingRows.length - 1 ? "none" : `0.5px solid ${BOOK_SUBTLE}`,
                            fontFamily: LATO,
                            fontSize: "12px",
                            color: WHITE,
                            lineHeight: 1.45,
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            {row.label}
                            {row.unit_label ? (
                              <span style={{ color: MUTED, fontSize: "11px", marginLeft: "6px" }}>
                                · {row.unit_label}
                              </span>
                            ) : null}
                          </span>
                          <span style={{ textAlign: "right" }}>{row.quantity}</span>
                          <span style={{ textAlign: "right", color: MUTED }}>{formatMoney(row.unit_price)}</span>
                          <span style={{ textAlign: "right", color: GOLD }}>{formatMoney(row.line_total)}</span>
                        </div>
                      ))}
                      {/* Phase 15H — show the proposal grand total directly under the line table. */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: "8px",
                          padding: "12px 0 0",
                          borderTop: "0.5px solid var(--oraya-book-input-border)",
                          marginTop: "4px",
                          fontFamily: LATO,
                        }}
                      >
                        <span style={{ fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>
                          Final event total
                        </span>
                        <span style={{ fontSize: "14px", color: GOLD, textAlign: "right" }}>
                          {proposalTotal !== null ? formatMoney(proposalTotal) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {proposalValidUntil && (
                  <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, lineHeight: 1.6, margin: 0 }}>
                    Payment deadline: <span style={{ color: GOLD }}>{proposalValidUntil}</span>
                  </p>
                )}
                {proposalSentAt && (
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.6, margin: 0 }}>
                    Sent on {proposalSentAt}
                  </p>
                )}
              </div>

              {proposalIncludedServices.length > 0 && (
                <div style={{ borderTop: `0.5px solid ${BOOK_SUBTLE}`, marginTop: "14px", paddingTop: "14px", display: "grid", gap: "8px" }}>
                  <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                    Included services
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {proposalIncludedServices.map((service, index) => (
                      <span key={`${service.label}-${index}`} style={{ fontFamily: LATO, fontSize: "11px", color: WHITE, border: "0.5px solid var(--oraya-border)", backgroundColor: GLASS1, padding: "7px 10px" }}>
                        {formatProposalIncludedService(service)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {booking.proposal_excluded_services?.trim() && (
                <div style={{ borderTop: `0.5px solid ${BOOK_SUBTLE}`, marginTop: "14px", paddingTop: "14px" }}>
                  <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
                    Excluded services
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
                    {booking.proposal_excluded_services}
                  </p>
                </div>
              )}

              {booking.proposal_optional_services?.trim() && (
                <div style={{ borderTop: `0.5px solid ${BOOK_SUBTLE}`, marginTop: "14px", paddingTop: "14px" }}>
                  <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
                    Optional services
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
                    {booking.proposal_optional_services}
                  </p>
                </div>
              )}

              {booking.proposal_notes?.trim() && (
                <div style={{ borderTop: `0.5px solid ${BOOK_SUBTLE}`, marginTop: "14px", paddingTop: "14px" }}>
                  <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
                    Proposal notes
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
                    {booking.proposal_notes}
                  </p>
                </div>
              )}

              {proposalPaymentMethods.length > 0 && (
                <div style={{ borderTop: `0.5px solid ${BOOK_SUBTLE}`, marginTop: "14px", paddingTop: "14px" }}>
                  <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: "0 0 8px" }}>
                    Payment methods
                  </p>
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.7, margin: 0 }}>
                    {proposalPaymentMethods.map((method) => formatPaymentMethodLabel(method)).join(", ")}
                  </p>
                </div>
              )}

              <div style={{ borderTop: `0.5px solid ${BOOK_SUBTLE}`, marginTop: "14px", paddingTop: "14px" }}>
                {canRespondToProposal ? (
                  <div style={{ display: "grid", gap: "12px" }}>
                    <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, lineHeight: 1.75, margin: 0 }}>
                      If you would like to proceed, let Oraya know using one of the actions below.
                    </p>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <form action="/api/booking-action/proposal" method="post">
                        <input type="hidden" name="token" value={params.token} />
                        <input type="hidden" name="response" value="accepted" />
                        <button
                          type="submit"
                          style={{
                            fontFamily: LATO,
                            fontSize: "10px",
                            letterSpacing: "2px",
                            textTransform: "uppercase",
                            color: GOLD_CTA,
                            backgroundColor: GOLD,
                            border: "none",
                            padding: "13px 18px",
                            cursor: "pointer",
                          }}
                        >
                          Accept proposal
                        </button>
                      </form>
                      <form action="/api/booking-action/proposal" method="post">
                        <input type="hidden" name="token" value={params.token} />
                        <input type="hidden" name="response" value="declined" />
                        <button
                          type="submit"
                          style={{
                            fontFamily: LATO,
                            fontSize: "10px",
                            letterSpacing: "2px",
                            textTransform: "uppercase",
                            color: WHITE,
                            backgroundColor: GLASS1,
                            border: "0.5px solid var(--oraya-border)",
                            padding: "13px 18px",
                            cursor: "pointer",
                          }}
                        >
                          Decline proposal
                        </button>
                      </form>
                    </div>
                  </div>
                ) : proposalExpired ? (
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: "#f2a7a7", lineHeight: 1.75, margin: 0 }}>
                    Proposal expired.
                  </p>
                ) : booking.proposal_status === "accepted" ? (
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: "#6fcf8a", lineHeight: 1.75, margin: 0 }}>
                    {booking.status === "confirmed"
                      ? ((booking.payment_status === null || booking.payment_status === "unpaid")
                          ? "Your event is confirmed. Payment details will be shared shortly."
                          : "Your event has been confirmed and payment details are now available below.")
                      : "Your event is awaiting confirmation from Oraya."}
                  </p>
                ) : booking.proposal_status === "declined" ? (
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: "#f2a7a7", lineHeight: 1.75, margin: 0 }}>
                    You declined this proposal. Oraya can revise the proposal if needed.
                  </p>
                ) : (
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, lineHeight: 1.75, margin: 0 }}>
                    Contact Oraya to discuss this proposal.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div style={{ border: "0.5px solid var(--oraya-border)", padding: "1.75rem", marginBottom: "2rem", textAlign: "left", backgroundColor: GLG3 }}>
              <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "0.75rem" }}>
                Next steps
              </p>
              <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, lineHeight: 1.7, margin: 0 }}>
                Oraya will review your event request and follow up with availability, setup options, and a tailored proposal.
              </p>
              <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.7, margin: "12px 0 0" }}>
                Payment is not processed on this page. Instructions are shared after Oraya confirms availability and next steps.
              </p>
            </div>
          )
        ) : (
          <div style={{ border: "0.5px solid var(--oraya-border)", padding: "1.75rem", marginBottom: "2rem", textAlign: "left", backgroundColor: GLG3 }}>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "1rem" }}>
              Estimated booking total
            </p>
            {paymentRows.map(([label, value, isTotal]) => (
              <div
                key={String(label)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "16px",
                  padding: isTotal ? "12px 0 0" : "9px 0",
                  borderTop: isTotal ? "0.5px solid var(--oraya-book-input-border)" : `0.5px solid ${BOOK_SUBTLE}`,
                }}
              >
                <span style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED }}>
                  {String(label)}
                </span>
                <span style={{ fontFamily: LATO, fontSize: isTotal ? "16px" : "13px", color: isTotal ? GOLD : WHITE, fontWeight: isTotal ? 600 : 300, textAlign: "right" }}>
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {paymentReturn && (
          <div
            style={{
              border:
                paymentReturn.tone === "success"
                  ? "0.5px solid rgba(111,207,138,0.28)"
                  : "0.5px solid rgba(197,164,109,0.22)",
              backgroundColor:
                paymentReturn.tone === "success"
                  ? "rgba(111,207,138,0.08)"
                  : "rgba(197,164,109,0.06)",
              padding: "14px 16px",
              marginBottom: "2rem",
              textAlign: "left",
            }}
          >
            <p style={{ fontFamily: LATO, fontSize: "12px", color: paymentReturn.tone === "success" ? "#9fe0ae" : WHITE, lineHeight: 1.7, margin: 0 }}>
              {paymentReturn.text}
            </p>
          </div>
        )}

        {!isEventInquiry && statusNorm !== "cancelled" && (
          <div
            style={{
              border: paymentOverdue ? "0.5px solid rgba(224,112,112,0.32)" : `0.5px solid ${stayPaymentPresentation.tone.border}`,
              padding: "1.75rem",
              marginBottom: "2rem",
              textAlign: "left",
              backgroundColor: paymentOverdue ? "rgba(224,112,112,0.05)" : GLASS3,
            }}
          >
            <div style={{ display: "grid", gap: "14px" }}>
              <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                Payment
              </p>
              <p style={{ fontFamily: PLAYFAIR, fontSize: "1.15rem", color: WHITE, margin: 0, lineHeight: 1.35 }}>
                {stayPaymentPresentation.label}
              </p>
              <p style={{ fontFamily: LATO, fontSize: "13px", color: BOOK_P82, lineHeight: 1.7, margin: 0 }}>
                {stayPaymentPresentation.body}
              </p>

              {stayPaymentPresentation.actionUrl && stayPaymentPresentation.actionLabel && (
                <a
                  href={stayPaymentPresentation.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: LATO,
                    fontSize: "11px",
                    letterSpacing: "2px",
                    textTransform: "uppercase",
                    color: GOLD_CTA,
                    backgroundColor: GOLD,
                    padding: "12px 16px",
                    textDecoration: "none",
                    width: "fit-content",
                  }}
                >
                  {stayPaymentPresentation.actionLabel}
                </a>
              )}
            </div>

            {paymentOverdue && (
              <div
                style={{
                  border: "0.5px solid rgba(224,112,112,0.28)",
                  backgroundColor: "rgba(224,112,112,0.08)",
                  borderRadius: "8px",
                  padding: "12px 14px",
                  marginTop: "14px",
                }}
              >
                <p style={{ fontFamily: LATO, fontSize: "12px", color: "#f0bd67", lineHeight: 1.7, margin: 0 }}>
                  Payment timing needs a refresh. Oraya will confirm the next secure payment step directly.
                </p>
              </div>
            )}

            {stayPaymentPresentation.rows.length > 0 && (
              <div style={{ borderTop: "0.5px solid var(--oraya-book-subtle-line)", marginTop: "14px", paddingTop: "14px", display: "grid", gap: "10px" }}>
                {stayPaymentPresentation.rows.map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: "14px", alignItems: "baseline" }}>
                    <span style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "1.5px", textTransform: "uppercase", color: MUTED, flexShrink: 0 }}>
                      {label}
                    </span>
                    <span style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, textAlign: "right", lineHeight: 1.5 }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {booking.refund_status && (
              <div style={{ borderTop: "0.5px solid var(--oraya-book-subtle-line)", marginTop: "14px", paddingTop: "14px", display: "grid", gap: "8px" }}>
                <p style={{ fontFamily: LATO, fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: GOLD, margin: 0 }}>
                  Refund
                </p>
                <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, lineHeight: 1.6, margin: 0 }}>
                  Refund recorded
                  {refundAmount !== null ? " - " + formatMoney(refundAmount) : ""}
                </p>
                {refundedAt && (
                  <p style={{ fontFamily: LATO, fontSize: "12px", color: MUTED, lineHeight: 1.6, margin: 0 }}>
                    Refunded on {refundedAt}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Message card (if any) — event inquiries: guest text only (no structured estimate JSON). */}
        {((isEventInquiry && eventGuestNotes) || (!isEventInquiry && booking.message)) && (
          <div style={{ border: "0.5px solid var(--oraya-border)", padding: "1.75rem", marginBottom: "2.5rem", textAlign: "left" }}>
            <p style={{ fontFamily: LATO, fontSize: "9px", letterSpacing: "3px", textTransform: "uppercase", color: GOLD, marginBottom: "0.75rem" }}>
              Your note
            </p>
            <p style={{ fontFamily: LATO, fontSize: "13px", color: WHITE, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>
              {isEventInquiry ? eventGuestNotes : booking.message}
            </p>
          </div>
        )}

        <div
          style={{
            border: "0.5px solid var(--oraya-border)",
            padding: "1.25rem 1.5rem",
            marginBottom: "2rem",
            textAlign: "left",
          }}
        >
          <p style={{ fontFamily: LATO, fontSize: "12px", color: WHITE, margin: "0 0 6px", lineHeight: 1.6 }}>
            {VIEW_CHANGE_CANCEL_TITLE}
          </p>
          <p style={{ fontFamily: LATO, fontSize: "12px", color: "var(--oraya-book-p78)", margin: "0 0 8px", lineHeight: 1.65 }}>
            {VIEW_CHANGE_CANCEL_BODY}
          </p>
          <p style={{ fontFamily: LATO, fontSize: "11px", color: MUTED, margin: "0 0 12px", lineHeight: 1.65 }}>
            {CANCELLATION_HINT}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
            <a
              href={`mailto:hello@stayoraya.com?subject=${encodeURIComponent(`Booking ${ref} — change or cancellation`)}&body=${encodeURIComponent(`Hello Oraya,\n\nMy booking reference is ${ref}.\n\nI would like to cancel or change this booking.\n\n`)}`}
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: GOLD,
                textDecoration: "none",
              }}
            >
              Email
            </a>
            {waLinkDigits && (
              <a
                href={`https://wa.me/${waLinkDigits}?text=${encodeURIComponent(bookingWhatsAppChangePrefill(ref))}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: LATO,
                  fontSize: "11px",
                  letterSpacing: "1.5px",
                  textTransform: "uppercase",
                  color: GOLD,
                  textDecoration: "none",
                }}
              >
                WhatsApp
              </a>
            )}
            <Link
              href={REFUND_POLICY_HREF}
              style={{
                fontFamily: LATO,
                fontSize: "11px",
                letterSpacing: "1.5px",
                textTransform: "uppercase",
                color: GOLD,
                textDecoration: "none",
              }}
            >
              {VIEW_REFUND_POLICY_LINK_LABEL}
            </Link>
          </div>
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <BookingViewMemberLink bookingMemberId={booking.member_id} />
          <Link
            href="/"
            style={{
              display:        "inline-block",
              fontFamily:     LATO,
              fontSize:       "11px",
              letterSpacing:  "2.5px",
              textTransform:  "uppercase",
              color:          GOLD_CTA,
              backgroundColor: GOLD,
              padding:        "15px 36px",
              textDecoration: "none",
            }}
          >
            Back to home
          </Link>
          <a
            href={`mailto:hello@stayoraya.com?subject=${encodeURIComponent(`Booking ${ref}`)}&body=${encodeURIComponent(`Hello Oraya,\n\nMy booking reference is ${ref}.\n\n`)}`}
            style={{
              display:        "inline-block",
              fontFamily:     LATO,
              fontSize:       "11px",
              letterSpacing:  "2px",
              textTransform:  "uppercase",
              color:          WHITE,
              backgroundColor: GLASS1,
              border:         "0.5px solid var(--oraya-book-input-border)",
              padding:        "15px 36px",
              textDecoration: "none",
            }}
          >
            Email hello@stayoraya.com
          </a>
          {waLinkDigits && (
            <a
              href={`https://wa.me/${waLinkDigits}?text=${encodeURIComponent(bookingWhatsAppPrefill(ref))}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            "8px",
                fontFamily:     LATO,
                fontSize:       "11px",
                letterSpacing:  "2px",
                textTransform:  "uppercase",
                color:          WHITE,
                backgroundColor: "#25D366",
                padding:        "15px 36px",
                textDecoration: "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp us
            </a>
          )}
        </div>

        <p style={{ fontFamily: LATO, fontSize: "11px", color: "var(--oraya-book-p20)", marginTop: "2.5rem" }}>
          This link is unique to your booking and expires at the end of your stay.
        </p>
      </div>
    </PublicTrustShell>
  );
}
