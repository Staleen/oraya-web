/**
 * Who a booking belongs to, for anything addressed to the guest.
 *
 * Pinned because the secure-payment page called every signed-in member "Oraya
 * guest" (owner report 2026-08-12): `bookings.guest_name` is written only for
 * anonymous bookers, so reading that column alone loses exactly the customers
 * Oraya knows best. `/api/payments/checkout` now resolves the payer through
 * this helper instead.
 *
 * Runner: Node built-in `node:test`.
 *   node --experimental-strip-types --test lib/booking-recipient.test.mts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveBookingRecipient } from "./booking-recipient.ts";

type MemberRow = { full_name: string | null };

/** The two calls the helper makes, and nothing else. */
function fakeDb(opts: {
  authEmail?: string | null;
  member?: MemberRow | null;
}) {
  return {
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: opts.authEmail ? { email: opts.authEmail } : null },
        }),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: opts.member ?? null }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof resolveBookingRecipient>[0];
}

test("a signed-in member is named from the member record, not the empty booking column", async () => {
  const db = fakeDb({ authEmail: "rana@example.com", member: { full_name: "Rana Haddad" } });

  const recipient = await resolveBookingRecipient(db, {
    member_id: "11111111-1111-1111-1111-111111111111",
    guest_name: null,
    guest_email: null,
  });

  assert.equal(recipient.name, "Rana Haddad");
  assert.equal(recipient.email, "rana@example.com");
});

test("a member with no name on file is a Member — never 'Guest' and never 'Oraya guest'", async () => {
  const db = fakeDb({ authEmail: "someone@example.com", member: { full_name: null } });

  const recipient = await resolveBookingRecipient(db, {
    member_id: "22222222-2222-2222-2222-222222222222",
    guest_name: null,
    guest_email: null,
  });

  assert.equal(recipient.name, "Member");
  assert.notEqual(recipient.name, "Oraya guest");
});

test("an anonymous booker keeps the name they typed on /book", async () => {
  const db = fakeDb({});

  const recipient = await resolveBookingRecipient(db, {
    member_id: null,
    guest_name: "Karim Nassar",
    guest_email: "karim@example.com",
  });

  assert.equal(recipient.name, "Karim Nassar");
  assert.equal(recipient.email, "karim@example.com");
});
