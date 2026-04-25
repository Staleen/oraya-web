export interface SeasonalOverride {
  id:            string;
  start_date:    string;
  end_date:      string;
  base_price:    number | null;
  weekday_price: number | null;
  weekend_price: number | null;
  minimum_stay:  number | null;
}

export interface VillaPricingConfig {
  base_price:         number | null;
  weekday_price:      number | null;
  weekend_price:      number | null;
  minimum_stay:       number | null;
  seasonal_overrides?: SeasonalOverride[];
}

export interface PricingInput {
  check_in:  string;
  check_out: string;
}

export type NightSource = "seasonal" | "weekday" | "weekend" | "base" | "unpriced";

export interface NightlyBreakdown {
  date:       string;
  is_weekend: boolean;
  price:      number | null;
  source:     NightSource;
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
