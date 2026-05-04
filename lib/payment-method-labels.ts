/** Human-readable labels for stored payment method keys (admin + guest). */
export function formatPaymentMethodLabel(value: string): string {
  switch (value) {
    case "cash":
      return "Cash";
    case "bank_transfer":
      return "Bank Transfer";
    case "whish":
      return "Wish Money / Western Union / BOB Finance / OMT";
    case "card_manual":
      return "Debit / Credit Card";
    case "other":
      return "Other";
    default:
      return `${value.charAt(0).toUpperCase()}${value.slice(1).replaceAll("_", " ")}`;
  }
}
