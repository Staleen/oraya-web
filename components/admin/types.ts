import type {
  AddonAppliesTo,
  AddonCategory,
  AddonCutoffType,
  AddonEnforcementMode,
  AddonEventPricingUnit,
  AddonPricingType,
} from "@/lib/addon-operations";

export interface BookingAddon {
  id:    string;
  label: string;
}

export interface BookingAddonSnapshot {
  id: string;
  label: string;
  price: number | null;
  category: AddonCategory | null;
  preparation_time_hours: number | null;
  enforcement_mode: AddonEnforcementMode | null;
  requires_approval: boolean;
  status: "confirmed" | "at_risk" | "pending_approval" | "approved" | "declined";
  same_day_warning?: "same_day_checkout" | "same_day_checkin" | null;
  admin_approved?: boolean;
  admin_approved_at?: string | null;
  /** Phase 12E Batch 7: set to "percentage" when the add-on price is derived from a % of the stay total. */
  pricing_type?: "percentage";
  /** Phase 12E Batch 7: the pre-discount base price, only present when a dead-day discount was applied. */
  original_price?: number | null;
  /** Phase 12E Batch 9: explicit tracking flag for applied offer usage. */
  offer_applied?: boolean;
  /** Phase 12E Batch 9: lightweight persisted offer source metadata. */
  offer_type?: "dead_day";
  /** Phase 12E Batch 9: persisted absolute savings for the applied offer. */
  savings?: number | null;
}

export interface BookingPricingInternalIntelligence {
  internal_value?: number;
  stay_value?: number;
  addons_value?: number;
  estimated_total?: number;
  tier: "basic" | "full" | "premium" | "unknown";
  confidence: "low" | "medium" | "high";
  basis: {
    bedroom_factor?: number;
    bedrooms?: number;
    guests?: number;
    event_inquiry?: boolean;
    service_intent?: "basic" | "full" | "premium";
    reason?: "intelligence_unavailable";
  };
}

export interface BookingPricingSnapshot {
  subtotal?: number;
  full_villa_subtotal?: number;
  adjusted_stay_subtotal?: number;
  estimated_total?: number;
  bedroom_factor?: number;
  bedrooms_to_be_used?: number;
  nightly_breakdown?: Array<{
    date: string;
    full_villa_rate: number | null;
    bedroom_adjusted_rate: number | null;
    source: "seasonal" | "weekday" | "weekend" | "base" | "unpriced";
  }>;
  internal_intelligence?: BookingPricingInternalIntelligence | null;
}

export interface BookingProposalIncludedService {
  id?: string | null;
  label: string;
  quantity?: number | null;
  unit_label?: string | null;
  /** Admin review: omitted or "approved" = included in proposal; "declined" excludes from guest-facing proposal. */
  admin_status?: "approved" | "declined" | null;
  /** Phase 15H — admin-set unit price for the line. Source of truth when present. */
  unit_price?: number | null;
  /** Phase 15H — admin-confirmed line total (= unit_price × quantity). Persisted so guest view doesn't recompute. */
  line_total?: number | null;
  /** Phase 15H — origin of the line: "requested" (from guest inquiry) or "custom" (added by admin). */
  source?: "requested" | "custom" | null;
  /** Phase 15H — optional admin note attached to the line. */
  notes?: string | null;
}

export interface Booking {
  id: string;
  villa: string;
  check_in: string;
  check_out: string;
  sleeping_guests: number;
  day_visitors: number;
  event_type: string | null;
  message: string | null;
  addons: BookingAddon[] | null;
  addons_snapshot?: BookingAddonSnapshot[] | null;
  pricing_subtotal?: number | null;
  pricing_snapshot?: BookingPricingSnapshot | null;
  status: string;
  created_at: string;
  member_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_country: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  deposit_amount?: number | null;
  amount_paid?: number | null;
  payment_reference?: string | null;
  payment_notes?: string | null;
  payment_requested_at?: string | null;
  payment_received_at?: string | null;
  payment_due_at?: string | null;
  payment_marked_by?: string | null;
  refund_status?: string | null;
  refund_amount?: number | null;
  refunded_at?: string | null;
  proposal_status?: "draft" | "sent" | "accepted" | "declined" | "expired" | null;
  proposal_total_amount?: number | null;
  proposal_deposit_amount?: number | null;
  proposal_included_services?: BookingProposalIncludedService[] | null;
  proposal_excluded_services?: string | null;
  proposal_optional_services?: string | null;
  proposal_notes?: string | null;
  proposal_valid_until?: string | null;
  proposal_payment_methods?: string[] | null;
  proposal_sent_at?: string | null;
  proposal_responded_at?: string | null;
  /** Phase 15F.7 — last admin-triggered feedback request email (cooldown + audit). */
  feedback_requested_at?: string | null;
  feedback_requested_channel?: string | null;
  feedback_request_count?: number | null;
}

export interface Member {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  address: string | null;
  created_at: string;
}

export interface CalendarSource {
  id: string;
  villa: string;
  source_name: string;
  feed_url: string;
  is_enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_error: string | null;
  created_at: string;
}

export interface Addon {
  id:            string;
  label:         string;
  enabled:       boolean;
  currency:      string;
  price:         number | null;
  pricing_model: "flat_fee" | "per_night" | "per_person_per_day" | "per_unit";
  preparation_time_hours?: number | null;
  cutoff_type?: AddonCutoffType | null;
  requires_approval?: boolean;
  category?: AddonCategory | null;
  enforcement_mode?: AddonEnforcementMode | null;
  applicable_villas?: string[];
  description?: string;
  display_order?: number | null;
  recommended?: boolean;
  pricing_type?: AddonPricingType;
  percentage_value?: number | null;
  applies_to?: AddonAppliesTo;
  applicable_event_types?: string[];
  quantity_enabled?: boolean;
  unit_label?: string | null;
  pricing_unit?: AddonEventPricingUnit | null;
  min_quantity?: number | null;
  max_quantity?: number | null;
}

export type AddonValidationLevel = "error" | "warning";

export type AddonValidationField =
  | "label"
  | "price"
  | "preparation_time_hours"
  | "pricing_model"
  | "enforcement_mode";

export interface AddonValidationIssue {
  addon_id: string;
  level: AddonValidationLevel;
  field?: AddonValidationField;
  message: string;
}
