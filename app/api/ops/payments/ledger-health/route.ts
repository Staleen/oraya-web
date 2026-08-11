import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOps } from "@/lib/ops-auth";
import {
  describeSuspicion,
  findSuspectLedgerEntries,
  type LedgerEntry,
} from "@/lib/payments/ledger-suspicion";
import { formatBookingReference } from "@/lib/booking-reference";

/**
 * Read-only: which ledger entries assert money nobody has proven exists.
 *
 * Deliberately GET-only and owner-only. Every remedy this reports moves
 * recorded money, and appending a compensating entry is a decision a human
 * makes with Business Center open — not something a report route does on its
 * own. Nothing here writes.
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const COLUMNS =
  "id, booking_id, transaction_type, status, amount, method, provider, provider_reference, verified_source, reverses_transaction_id, notes, created_at";

export async function GET(request: Request) {
  const auth = await requireOps(request, { requiredRole: "owner" });
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("payment_transactions")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[api/ops/payments/ledger-health] lookup failed:", error.message);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500, headers: NO_STORE_HEADERS });
  }

  const entries = ((data ?? []) as unknown as Record<string, unknown>[]).map(
    (row): LedgerEntry => ({
      id: String(row.id),
      booking_id: (row.booking_id as string | null) ?? null,
      transaction_type: String(row.transaction_type ?? ""),
      status: String(row.status ?? ""),
      amount: Number(row.amount ?? 0),
      method: (row.method as string | null) ?? null,
      provider: (row.provider as string | null) ?? null,
      provider_reference: (row.provider_reference as string | null) ?? null,
      verified_source: (row.verified_source as string | null) ?? null,
      reverses_transaction_id: (row.reverses_transaction_id as string | null) ?? null,
      notes: (row.notes as string | null) ?? null,
      created_at: String(row.created_at ?? ""),
    }),
  );

  const suspects = findSuspectLedgerEntries(entries);

  return NextResponse.json(
    {
      ok: true,
      checked: entries.length,
      suspect_count: suspects.length,
      overstated_total: suspects.reduce((sum, s) => sum + s.overstated_by, 0),
      suspects: suspects.map((s) => ({
        transaction_id: s.entry.id,
        booking_reference: formatBookingReference(s.entry.booking_id),
        type: s.entry.transaction_type,
        amount: s.entry.amount,
        created_at: s.entry.created_at,
        why: s.suspicions.map(describeSuspicion),
        remedy: s.remedy,
      })),
    },
    { headers: NO_STORE_HEADERS },
  );
}
