/**
 * Can Oraya actually reach the person who just booked?
 *
 * `/book` deliberately accepts a WhatsApp number OR an email — asking for both
 * is friction. But only the email is used to acknowledge the request, and no
 * WhatsApp message is sent when a booking is created. So a guest who leaves a
 * phone number and no email submits a booking and hears nothing: no email
 * (there is no address), no WhatsApp, nothing but a browser redirect they lose
 * the moment they close the tab.
 *
 * Found auditing the anonymous booking path on 2026-08-12.
 *
 * This module does not invent a channel Oraya does not have. It makes the
 * silence visible to the operator, so a human sends the WhatsApp message the
 * system cannot. Pure — no I/O, so the rule is testable on its own.
 */

export type RequesterContact = {
  email?: string | null;
  phone?: string | null;
};

export type RequesterReachability = {
  /** True when the automatic acknowledgement email will actually go out. */
  can_email: boolean;
  /** What the operator's Email row should read. Never an empty string. */
  email_line: string;
  /**
   * Non-null when Oraya could NOT acknowledge the guest automatically, phrased
   * as the thing the operator has to do. Null when nothing is owed.
   */
  operator_action: string | null;
};

function clean(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function assessRequesterReachability(contact: RequesterContact): RequesterReachability {
  const email = clean(contact.email);
  const phone = clean(contact.phone);

  if (email) {
    return { can_email: true, email_line: email, operator_action: null };
  }
  if (phone) {
    return {
      can_email: false,
      email_line: "Not provided — no confirmation email was sent",
      operator_action: `This guest left no email address. Oraya sent them nothing. Message them on WhatsApp: ${phone}`,
    };
  }
  return {
    can_email: false,
    email_line: "Not provided — no confirmation email was sent",
    operator_action:
      "This guest left no email address and no phone number. Oraya has no way to reach them — open the booking and check the notes.",
  };
}
