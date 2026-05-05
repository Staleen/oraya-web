"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const GOLD = "var(--oraya-gold)";
const GOLD_CTA = "var(--oraya-gold-cta-text)";
const LATO = "'Lato', system-ui, sans-serif";

/** Shown only when the signed-in user is the member who owns this booking. */
export function BookingViewMemberLink({ bookingMemberId }: { bookingMemberId: string | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!bookingMemberId) {
      setVisible(false);
      return;
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!cancelled && user?.id === bookingMemberId) setVisible(true);
    });
    return () => {
      cancelled = true;
    };
  }, [bookingMemberId]);

  if (!visible) return null;

  return (
    <Link
      href="/profile"
      style={{
        display: "inline-block",
        fontFamily: LATO,
        fontSize: "11px",
        letterSpacing: "2.5px",
        textTransform: "uppercase",
        color: GOLD_CTA,
        backgroundColor: GOLD,
        padding: "15px 36px",
        textDecoration: "none",
      }}
    >
      View my bookings
    </Link>
  );
}
