import type { AddonCategory, AddonCutoffType, AddonEnforcementMode, AddonPricingType } from "@/lib/addon-operations";

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
  status: string;
  created_at: string;
  member_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_country: string | null;
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
