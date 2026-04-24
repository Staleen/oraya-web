export interface VillaPricingConfig {
  base_price:    number | null;
  weekday_price: number | null;
  weekend_price: number | null;
  minimum_stay:  number | null;
}

export interface PricingInput {
  check_in:  string;
  check_out: string;
}

export interface NightlyBreakdown {
  date:       string;
  is_weekend: boolean;
  price:      number | null;
}

export type PricingWarning =
  | { kind: "minimum_stay";    required: number; actual: number }
  | { kind: "unpriced_nights"; count: number };

export interface PricingResult {
  nights:   number;
  subtotal: number | null;
  nightly:  NightlyBreakdown[];
  warnings: PricingWarning[];
}
