"use client";
import { useMemo, useState } from "react";
import { Banner, Button, Card, PageHead, T } from "@/components/ops/ui";
import {
  CellInput, CellSelect, PendingBar, SetupGate, useSetupData, type SiteSettings,
} from "@/components/ops/setup-shared";

/**
 * The small site switches that used to live in /admin/settings: the WhatsApp
 * number guests are sent to, who gets notified of new bookings, whether
 * instant booking is offered per villa, and the Butler's check-in guidance.
 *
 * Same pending-changes discipline as the other Setup screens — every edit is
 * named before it goes live.
 */

function describeChanges(before: SiteSettings, after: SiteSettings): string[] {
  const out: string[] = [];
  if (before.whatsapp_number !== after.whatsapp_number) {
    out.push(`WhatsApp number: ${before.whatsapp_number || "none"} → ${after.whatsapp_number || "none"}`);
  }
  if (before.notification_emails !== after.notification_emails) {
    out.push("Who gets notified of new bookings changed");
  }
  if (before.butler_checkin_guidance !== after.butler_checkin_guidance) {
    out.push("Check-in guidance the WhatsApp assistant gives changed");
  }
  if (before.instant_mechmech !== after.instant_mechmech) {
    out.push(after.instant_mechmech ? "Villa Mechmech offers instant booking" : "Villa Mechmech no longer offers instant booking");
  }
  if (before.instant_byblos !== after.instant_byblos) {
    out.push(after.instant_byblos ? "Villa Byblos offers instant booking" : "Villa Byblos no longer offers instant booking");
  }
  const bc = before.card_checkout_behaviour, ac = after.card_checkout_behaviour;
  if (bc && ac) {
    if (bc.request_email !== ac.request_email) out.push(ac.request_email ? "Card form will ask for an email again" : "Card form no longer asks for an email");
    if (bc.request_phone !== ac.request_phone) out.push(ac.request_phone ? "Card form will ask for a phone number again" : "Card form no longer asks for a phone number");
    if (bc.billing_address !== ac.billing_address) out.push(ac.billing_address === "none" ? "Card form no longer asks for a billing address — address verification stops working" : "Card form asks for a full billing address");
    if (bc.skip_fraud_screening !== ac.skip_fraud_screening) out.push(ac.skip_fraud_screening ? "Fraud screening OFF — Decision Manager skipped on every payment" : "Fraud screening ON — Decision Manager reviews every payment (it currently rejects them all)");
    if (bc.capture_immediately !== ac.capture_immediately) out.push(ac.capture_immediately ? "Money is taken immediately when a guest pays" : "Cards are only HELD — you must capture the money yourself");
    if (bc.payer_authentication !== ac.payer_authentication) {
      out.push(
        ac.payer_authentication === "required"
          ? "3-D Secure STRICT — payments the bank will not verify are refused, and real cards will be turned away until Oraya can show a challenge screen"
          : ac.payer_authentication === "frictionless_only"
            ? "3-D Secure on, silent only — chargeback liability moves to the bank when it verifies quietly, and no guest is ever blocked"
            : "3-D Secure OFF — no bank verification on any payment",
      );
    }
  }
  if (before.arrival_guide_payment_gate !== after.arrival_guide_payment_gate) {
    out.push(after.arrival_guide_payment_gate
      ? "Arrival guide will be HELD until the deposit arrives"
      : "Arrival guide goes out as soon as you approve, paid or not");
  }
  if (before.instant_auto_confirm !== after.instant_auto_confirm) {
    out.push(after.instant_auto_confirm
      ? "Fully paid instant stays will CONFIRM THEMSELVES — no approval from you"
      : "Instant stays go back to needing your approval");
  }
  return out;
}

export default function SitePage() {
  const { data, loading, loadError, ownerOnly, reload } = useSetupData();
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [flash, setFlash] = useState("");

  const original = data?.site ?? null;
  const working = draft ?? original;
  const changes = useMemo(
    () => (original && draft ? describeChanges(original, draft) : []),
    [original, draft],
  );

  function update(patch: Partial<SiteSettings>) {
    setFlash("");
    setDraft((cur) => ({ ...(cur ?? original!), ...patch }));
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setSaveError("");
    try {
      const r = await fetch("/api/ops/setup/site", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !body.ok) { setSaveError(body.error ?? "That didn't save."); return; }
      setDraft(null);
      await reload();
      setFlash("Saved — live on the website now.");
    } catch {
      setSaveError("Couldn't reach Oraya. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  const gate = SetupGate({ loading: loading && !data, loadError: data ? "" : loadError, ownerOnly, onRetry: reload });

  return (
    <>
      <PageHead title="Site" sub="How guests reach you, and what the website offers" />

      {flash && <Banner tone="ok" title="Live" onDismiss={() => setFlash("")}>{flash}</Banner>}

      {gate ?? (working && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: "20px", alignItems: "start" }}>
            <Card title="Contact">
              <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                WhatsApp number guests message
              </label>
              <CellInput
                value={working.whatsapp_number}
                inputMode="tel"
                placeholder="9613123456"
                onChange={(e) => update({ whatsapp_number: e.target.value })}
              />
              <p style={{ margin: "6px 0 18px", fontSize: "12px", color: T.faint }}>
                Full number with country code, digits only. Every &ldquo;chat with us&rdquo; button uses it.
              </p>

              <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                Who gets emailed about new bookings
              </label>
              <CellInput
                value={working.notification_emails}
                placeholder="you@example.com, someone@example.com"
                onChange={(e) => update({ notification_emails: e.target.value })}
              />
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: T.faint }}>
                Separate several with commas.
              </p>
            </Card>

            <Card title="Card checkout — what guests are asked for">
              <p style={{ margin: "0 0 14px", fontSize: "12px", color: T.faint, lineHeight: 1.6 }}>
                CyberSource&apos;s own dashboard cannot change these for Oraya — the payment request
                overrides it. So they live here.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "12px", marginBottom: "14px" }}>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Ask for email
                  <CellSelect style={{ marginTop: "6px" }} value={working.card_checkout_behaviour?.request_email ? "yes" : "no"}
                    onChange={(e) => update({ card_checkout_behaviour: { ...working.card_checkout_behaviour, request_email: e.target.value === "yes" } })}>
                    <option value="no">No — Oraya already has it</option>
                    <option value="yes">Yes — ask again</option>
                  </CellSelect>
                </label>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Ask for phone
                  <CellSelect style={{ marginTop: "6px" }} value={working.card_checkout_behaviour?.request_phone ? "yes" : "no"}
                    onChange={(e) => update({ card_checkout_behaviour: { ...working.card_checkout_behaviour, request_phone: e.target.value === "yes" } })}>
                    <option value="no">No — Oraya already has it</option>
                    <option value="yes">Yes — ask again</option>
                  </CellSelect>
                </label>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Billing address
                  <CellSelect style={{ marginTop: "6px" }} value={working.card_checkout_behaviour?.billing_address ?? "full"}
                    onChange={(e) => update({ card_checkout_behaviour: { ...working.card_checkout_behaviour, billing_address: e.target.value === "none" ? "none" : "full" } })}>
                    <option value="full">Ask for the full address</option>
                    <option value="none">Don&apos;t ask — card details only</option>
                  </CellSelect>
                </label>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  When to take the money
                  <CellSelect style={{ marginTop: "6px" }} value={working.card_checkout_behaviour?.capture_immediately ? "now" : "later"}
                    onChange={(e) => update({ card_checkout_behaviour: { ...working.card_checkout_behaviour, capture_immediately: e.target.value === "now" } })}>
                    <option value="now">Immediately when they pay</option>
                    <option value="later">Hold the card, capture later</option>
                  </CellSelect>
                </label>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Fraud screening
                  <CellSelect style={{ marginTop: "6px" }} value={working.card_checkout_behaviour?.skip_fraud_screening ? "off" : "on"}
                    onChange={(e) => update({ card_checkout_behaviour: { ...working.card_checkout_behaviour, skip_fraud_screening: e.target.value === "off" } })}>
                    <option value="off">Off — skip Decision Manager</option>
                    <option value="on">On — Decision Manager reviews payments</option>
                  </CellSelect>
                </label>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  3-D Secure
                  <CellSelect style={{ marginTop: "6px" }} value={working.card_checkout_behaviour?.payer_authentication ?? "off"}
                    onChange={(e) => update({ card_checkout_behaviour: { ...working.card_checkout_behaviour, payer_authentication: e.target.value === "required" ? "required" : e.target.value === "frictionless_only" ? "frictionless_only" : "off" } })}>
                    <option value="off">Off — no bank verification</option>
                    <option value="frictionless_only">On, silent only — never blocks a guest</option>
                    <option value="required">On, strict — refuse what the bank won&apos;t verify</option>
                  </CellSelect>
                </label>
              </div>
              <p style={{ margin: 0, fontSize: "12px", color: T.muted, lineHeight: 1.6 }}>
                3-D Secure shifts chargeback liability to the card issuer. <b>Silent only</b> takes that
                protection when the bank grants it without asking the guest anything, and lets the payment
                through unverified when the bank wants to challenge them — so nobody is ever left stuck.
                <b> Strict</b> refuses those payments instead: safest against chargebacks, and it will turn
                away real cards until Oraya can show a bank challenge screen.
              </p>
              <p style={{ margin: 0, fontSize: "12px", color: T.warn, lineHeight: 1.6 }}>
                Fraud screening is off because Decision Manager currently rejects <b>every</b> payment on
                your merchant account with reason 481. Turning it on will stop card payments working until
                NetCommerce fixes it. Without a billing address, address verification cannot run.
              </p>
            </Card>

            <Card title="What the website offers">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "12px", marginBottom: "18px" }}>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Villa Mechmech
                  <CellSelect style={{ marginTop: "6px" }} value={working.instant_mechmech ? "yes" : "no"}
                    onChange={(e) => update({ instant_mechmech: e.target.value === "yes" })}>
                    <option value="no">Standard — &ldquo;request to book&rdquo;</option>
                    <option value="yes">Show the instant-booking lane</option>
                  </CellSelect>
                </label>
                <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted }}>
                  Villa Byblos
                  <CellSelect style={{ marginTop: "6px" }} value={working.instant_byblos ? "yes" : "no"}
                    onChange={(e) => update({ instant_byblos: e.target.value === "yes" })}>
                    <option value="no">Standard — &ldquo;request to book&rdquo;</option>
                    <option value="yes">Show the instant-booking lane</option>
                  </CellSelect>
                </label>
              </div>
              <p style={{ margin: "-6px 0 18px", fontSize: "12px", color: T.muted, lineHeight: 1.6 }}>
                This changes which lane the booking page <b>shows</b> for each villa. Whether a paid
                stay confirms itself is the separate switch below.
              </p>

              <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, display: "block", marginBottom: "10px" }}>
                Hold the arrival guide until the deposit arrives
                <CellSelect style={{ marginTop: "6px" }} value={working.arrival_guide_payment_gate ? "yes" : "no"}
                  onChange={(e) => update({ arrival_guide_payment_gate: e.target.value === "yes" })}>
                  <option value="no">No — send it as soon as I approve</option>
                  <option value="yes">Yes — hold it until they have paid</option>
                </CellSelect>
              </label>
              <p style={{ margin: "-6px 0 18px", fontSize: "12px", color: T.faint, lineHeight: 1.6 }}>
                The arrival details are the product. With this on, an approved guest still gets the
                confirmation email immediately, but the WhatsApp arrival guide waits until the deposit
                lands — then goes out on its own, once. Twenty confirmed bookings are currently unpaid
                and three of them already hold arrival guides.
              </p>

              <label style={{ fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, display: "block", marginBottom: "10px" }}>
                Confirm instant stays automatically
                <CellSelect style={{ marginTop: "6px" }} value={working.instant_auto_confirm ? "yes" : "no"}
                  onChange={(e) => update({ instant_auto_confirm: e.target.value === "yes" })}>
                  <option value="no">No — every booking waits for my approval</option>
                  <option value="yes">Yes — a stay paid in full confirms itself</option>
                </CellSelect>
              </label>
              <p style={{ margin: "-6px 0 18px", fontSize: "12px", color: working.instant_auto_confirm ? T.warn : T.faint, lineHeight: 1.6 }}>
                {working.instant_auto_confirm ? (
                  <>
                    <b>On.</b> A guest who books an instant villa with <b>no add-ons</b>, <b>no special
                    request</b>, and pays <b>the full amount</b> is confirmed the moment the money lands,
                    and immediately receives the confirmation email and the WhatsApp arrival guide —
                    without you seeing it first. Availability is re-checked at the moment of payment, so
                    two guests paying for the same nights cannot both be confirmed. Anything with add-ons,
                    a special request, a deposit-only payment, or an event still waits for you.
                  </>
                ) : (
                  <>Off. Every booking arrives here for your approval, however it was paid.</>
                )}
              </p>

              <label style={{ display: "block", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", color: T.muted, marginBottom: "6px" }}>
                Check-in guidance the WhatsApp assistant gives
              </label>
              <textarea
                value={working.butler_checkin_guidance}
                onChange={(e) => update({ butler_checkin_guidance: e.target.value })}
                rows={4}
                placeholder="e.g. Check-in is from 3pm. Someone meets you at the gate."
                style={{
                  width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,.05)",
                  border: `1px solid ${T.borderStrong}`, borderRadius: T.rSm, padding: "12px 13px",
                  fontFamily: T.sans, fontSize: "14px", color: T.ink, outline: "none", resize: "vertical",
                }}
              />
              <p style={{ margin: "6px 0 0", fontSize: "12px", color: T.faint }}>
                Sent to confirmed guests who ask on WhatsApp. Never include gate codes or PINs.
              </p>
            </Card>
          </div>

          <PendingBar
            changes={changes}
            busy={busy}
            error={saveError}
            onDiscard={() => { setDraft(null); setSaveError(""); }}
            onSave={() => void save()}
            onDismissError={() => setSaveError("")}
          />
        </>
      ))}
    </>
  );
}
