"use client";
import { memo } from "react";
import type { Booking } from "../types";
import { AddonIcon } from "@/components/addon-icon";
import { GOLD, LATO, MUTED, WHITE } from "../theme";
import {
  addonHasTrackedOffer,
  formatAddonPrice,
  getAddonRiskWarning,
  getAddonStatusTone,
  hasDiscountPriceMetadata,
  hasResolvedAddonStatus,
  renderOperationalBadge,
} from "./helpers";
import type { BookingCardActions } from "./actions";

/**
 * Remediation 2 (B.1) — renderAddonRows extracted verbatim into a memoized
 * child. `activeAddonResolution` is derived per-card by the parent
 * (`<addonId>-approve|-decline` while THIS booking has an add-on resolution
 * in flight; null otherwise), so other cards' props stay untouched.
 */
function AddonRowsImpl({
  booking,
  activeAddonResolution,
  isMobile,
  actions,
}: {
  booking: Booking;
  activeAddonResolution: string | null;
  isMobile: boolean;
  actions: BookingCardActions;
}) {
    const addonSnapshots = booking.addons_snapshot ?? [];
    if (addonSnapshots.length === 0) return null;

    return (
      <div style={{ display: "grid", gap: "12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: MUTED,
          }}
        >
          <span
            style={{
              fontFamily: LATO,
              fontSize: "10px",
              letterSpacing: "2.4px",
              textTransform: "uppercase",
            }}
          >
            Add-ons
          </span>
          <span style={{ flex: 1, height: "1px", backgroundColor: "rgba(255,255,255,0.08)" }} />
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          {addonSnapshots.map((addon) => {
            const statusTone = getAddonStatusTone(addon.status);
            const isResolved = hasResolvedAddonStatus(addon);
            const isPendingApproval = addon.requires_approval && addon.status === "pending_approval";
            const isApproving = activeAddonResolution === `${addon.id}-approve`;
            const isDeclining = activeAddonResolution === `${addon.id}-decline`;
            const sameDayRiskWarning = getAddonRiskWarning(addon);
            const hasDiscountMetadata = hasDiscountPriceMetadata(addon);
            const originalDiscountPrice = hasDiscountMetadata ? addon.original_price! : null;
            const finalDiscountPrice = hasDiscountMetadata ? addon.price! : null;
            const savingsAmount = hasDiscountMetadata ? addon.savings! : null;
            const hasTrackedOffer = addonHasTrackedOffer(addon);

            return (
              <div
                key={`${booking.id}-${addon.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
                  gap: "10px 14px",
                  alignItems: "start",
                  paddingBottom: "12px",
                  borderBottom: "0.5px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                    }}
                  >
                    <AddonIcon
                      label={addon.label}
                      size={16}
                      color="rgba(197,164,109,0.5)"
                      style={{ flexShrink: 0, marginTop: "2px" }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          justifyContent: "space-between",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <p
                          style={{
                            fontFamily: LATO,
                            fontSize: "15px",
                            color: WHITE,
                            margin: 0,
                            lineHeight: 1.4,
                          }}
                        >
                          {addon.label}
                          {addon.pricing_type === "percentage" && (
                            <span
                              style={{
                                fontFamily: LATO,
                                fontSize: "9px",
                                letterSpacing: "1.2px",
                                textTransform: "uppercase",
                                color: "#7ecfcf",
                                backgroundColor: "rgba(126,207,207,0.12)",
                                border: "0.5px solid rgba(126,207,207,0.28)",
                                padding: "3px 7px",
                                borderRadius: "4px",
                                marginLeft: "8px",
                                verticalAlign: "middle",
                              }}
                            >
                              % of stay
                            </span>
                          )}
                        </p>
                        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
                          {hasDiscountMetadata ? (
                            <>
                              <p
                                style={{
                                  fontFamily: LATO,
                                  fontSize: "12px",
                                  color: MUTED,
                                  margin: 0,
                                  lineHeight: 1.4,
                                  textDecoration: "line-through",
                                }}
                              >
                                {formatAddonPrice(originalDiscountPrice)}
                              </p>
                              <p
                                style={{
                                  fontFamily: LATO,
                                  fontSize: "13px",
                                  color: "#7ecfcf",
                                  margin: 0,
                                  lineHeight: 1.4,
                                }}
                              >
                                {formatAddonPrice(finalDiscountPrice)}
                              </p>
                              <p
                                style={{
                                  fontFamily: LATO,
                                  fontSize: "11px",
                                  color: MUTED,
                                  margin: 0,
                                  lineHeight: 1.4,
                                }}
                              >
                                (Save ${savingsAmount?.toLocaleString("en-US")})
                              </p>
                            </>
                          ) : (
                            <p
                              style={{
                                fontFamily: LATO,
                                fontSize: "13px",
                                color: GOLD,
                                margin: 0,
                                lineHeight: 1.4,
                              }}
                            >
                              {formatAddonPrice(addon.price)}
                            </p>
                          )}
                        </div>

                        {hasDiscountMetadata && (
                          <p
                            style={{
                              fontFamily: LATO,
                              fontSize: "11px",
                              color: MUTED,
                              margin: "6px 0 0",
                              lineHeight: 1.5,
                            }}
                          >
                            Dead-day offer - Original {formatAddonPrice(originalDiscountPrice)} - Final {formatAddonPrice(finalDiscountPrice)} - Savings {formatAddonPrice(savingsAmount)}
                          </p>
                        )}
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                        {!isResolved && isPendingApproval && renderOperationalBadge("Requires approval", "approval")}
                        {addon.enforcement_mode === "soft" && renderOperationalBadge("Soft rule", "soft")}
                        {addon.enforcement_mode === "strict" && renderOperationalBadge("Strict rule", "strict")}
                        {hasTrackedOffer && (
                          <span
                            style={{
                              fontFamily: LATO,
                              fontSize: "9px",
                              letterSpacing: "1.2px",
                              textTransform: "uppercase",
                              color: "#7ecfcf",
                              backgroundColor: "rgba(126,207,207,0.12)",
                              padding: "4px 8px",
                              borderRadius: "4px",
                            }}
                          >
                            Dead-day offer
                          </span>
                        )}
                      </div>

                      {sameDayRiskWarning && (
                        <p
                          style={{
                            fontFamily: LATO,
                            fontSize: "11px",
                            color: "#e2ab5a",
                            margin: "8px 0 0",
                            lineHeight: 1.5,
                          }}
                        >
                          {sameDayRiskWarning}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    justifyItems: isMobile ? "start" : "end",
                    alignItems: "start",
                  }}
                >
                  <span
                    style={{
                      fontFamily: LATO,
                      fontSize: "9px",
                      letterSpacing: "1.5px",
                      textTransform: "uppercase",
                      color: statusTone.color,
                      backgroundColor: statusTone.background,
                      border: `0.5px solid ${statusTone.border}`,
                      padding: "7px 10px",
                      borderRadius: "6px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {addon.status.replaceAll("_", " ")}
                  </span>

                  {!isResolved && isPendingApproval && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: isMobile ? "column" : "row",
                        gap: "8px",
                        width: isMobile ? "100%" : "auto",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => actions.resolveAddon(booking.id, addon.id, "approve")}
                        disabled={isApproving || isDeclining}
                        style={{
                          fontFamily: LATO,
                          fontSize: "10px",
                          letterSpacing: "1.2px",
                          textTransform: "uppercase",
                          color: "#6fcf8a",
                          backgroundColor: "transparent",
                          border: "0.5px solid rgba(111,207,138,0.45)",
                          padding: "8px 12px",
                          borderRadius: "4px",
                          cursor: isApproving || isDeclining ? "not-allowed" : "pointer",
                          opacity: isApproving || isDeclining ? 0.5 : 1,
                          minWidth: isMobile ? "100%" : "auto",
                        }}
                      >
                        {isApproving ? "Saving..." : "Approve"}
                      </button>
                      <button
                        type="button"
                        onClick={() => actions.resolveAddon(booking.id, addon.id, "decline")}
                        disabled={isApproving || isDeclining}
                        style={{
                          fontFamily: LATO,
                          fontSize: "10px",
                          letterSpacing: "1.2px",
                          textTransform: "uppercase",
                          color: "#f08b8b",
                          backgroundColor: "transparent",
                          border: "0.5px solid rgba(224,112,112,0.4)",
                          padding: "8px 12px",
                          borderRadius: "4px",
                          cursor: isApproving || isDeclining ? "not-allowed" : "pointer",
                          opacity: isApproving || isDeclining ? 0.5 : 1,
                          minWidth: isMobile ? "100%" : "auto",
                        }}
                      >
                        {isDeclining ? "Saving..." : "Decline"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontFamily: LATO, fontSize: "10px", color: MUTED, margin: 0, lineHeight: 1.5 }}>
          Approvals are saved to the booking record.
        </p>
      </div>
    );
}

export const AddonRows = memo(AddonRowsImpl);
