import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findPublicPaymentRequest } from "@/lib/payments/ledger-server";
import { formatPaymentAmount, remainingRequestAmount, type PaymentAllowedMethod } from "@/lib/payments/ledger";
import { PAYMENT_PUBLIC_SETTINGS_KEY, parsePaymentPublicSettings } from "@/lib/payments/settings";
import { getHostedCheckoutPublicStatus } from "@/lib/payments/runtime";
import { getCreditLibanaisPaymentCapabilities } from "@/lib/payments/credit-libanais";
import { paymentReturnMessage } from "@/lib/payments/guest-presentation";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const labels: Record<PaymentAllowedMethod, string> = {
  cash: "Cash", bank_transfer: "Bank transfer", card: "Credit or debit card", apple_pay: "Apple Pay",
  whish: "Whish", omt: "OMT Pay", western_union: "Western Union", suyool: "Suyool",
};

export default async function PaymentRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = searchParams ? await searchParams : {};
  const paymentReturnState = typeof query.payment === "string" ? query.payment : null;
  const payment = await findPublicPaymentRequest(token).catch(() => null);
  if (!payment) notFound();
  const [{ data: settingRow }, checkoutStatus] = await Promise.all([
    supabaseAdmin.from("settings").select("value").eq("key", PAYMENT_PUBLIC_SETTINGS_KEY).maybeSingle(),
    getHostedCheckoutPublicStatus(),
  ]);
  const settings = parsePaymentPublicSettings(settingRow?.value ?? null);
  const remaining = remainingRequestAmount(payment.amount, payment.amount_paid);
  const cardCheckoutReady = checkoutStatus.online_checkout_ready && checkoutStatus.provider_key === "credit_libanais";
  const applePayReady = cardCheckoutReady && getCreditLibanaisPaymentCapabilities().apple_pay_enabled;
  const onlineCheckoutAllowed =
    (payment.allowed_methods.includes("card") && cardCheckoutReady) ||
    (payment.allowed_methods.includes("apple_pay") && applePayReady);

  // A card-only request has nothing else on this page worth reading, so the
  // "Open secure checkout" button was a click that asked the guest to confirm
  // they meant the thing they had already clicked a link to do. Go straight to
  // the card form. Requests that also offer cash or bank transfer still render
  // the page, because those instructions ARE the content.
  //
  // Loop-safe: the checkout's cancel URL returns to the booking view, never
  // here, and any return state (?payment=...) renders the page normally.
  // ?view=1 is a deliberate escape hatch for support.
  const onlineOnlyRequest =
    payment.allowed_methods.length > 0 &&
    payment.allowed_methods.every((method) => method === "card" || method === "apple_pay");
  if (
    onlineCheckoutAllowed &&
    onlineOnlyRequest &&
    payment.payable &&
    !paymentReturnState &&
    query.view !== "1"
  ) {
    redirect(`/payments/checkout/${encodeURIComponent(token)}?subject=request`);
  }
  const isPaid = payment.status === "paid";
  const paymentReturn = paymentReturnMessage(paymentReturnState, { isPaid });

  return <main className={styles.page}>
    <div className={styles.shell}>
      <Image className={styles.logo} src="/logos/ORAYA_logo_full.png" width={160} height={160} alt="Oraya" priority />
      <section className={styles.card}>
        {paymentReturn ? (
          <p className={paymentReturn.tone === "success" ? styles.returnSuccess : styles.returnNeutral}>
            {paymentReturn.text}
          </p>
        ) : null}
        {!payment.payable ? <div className={styles.closed}>
          <p className={styles.eyebrow}>Payment request</p>
          <h2>{isPaid ? "Payment received" : "This link is no longer active"}</h2>
          <p className={styles.muted}>
            {isPaid
              ? "Thank you. Your payment has been received and recorded with Oraya."
              : "Please contact Oraya if you still need to make this payment."}
          </p>
        </div> : <>
          <p className={styles.eyebrow}>Secure Oraya payment request</p>
          <h1 className={styles.title}>{payment.description}</h1>
          <p className={styles.for}>Prepared for {payment.payer_name}</p>
          <div className={styles.amount}>
            <span className={styles.amountLabel}>{payment.amount_paid > 0 ? "Remaining to pay" : "Amount to pay"}</span>
            <strong className={styles.amountValue}>{formatPaymentAmount(remaining, payment.currency)}</strong>
          </div>
          <div className={styles.methods}>
            {payment.allowed_methods.map((method) => <div className={styles.method} key={method}>
              <p className={styles.methodTitle}>{labels[method]}</p>
              <p className={styles.muted}>
                {method === "bank_transfer" && settings.bank_transfer_public_details
                  ? settings.bank_transfer_public_details
                  : method === "cash" ? "Arrange payment with the Oraya team. A receipt will be recorded against this request."
                    // No acquirer name here. Oraya does not advertise its bank
                    // on its own payment page — the seal inside the secure
                    // checkout is the trust signal.
                    : method === "card" && cardCheckoutReady ? "Card, Apple Pay and Google Pay — whichever your device supports."
                      : method === "apple_pay" && applePayReady ? "Apple Pay is available inside the secure checkout on supported Apple devices."
                      : method === "card" || method === "apple_pay" ? "Secure online checkout will appear here when the payment provider is enabled."
                      : `Contact the Oraya team to complete this payment through ${labels[method]}.`}
              </p>
            </div>)}
          </div>
          {onlineCheckoutAllowed ?
            <a className={styles.payButton} href={`/payments/checkout/${encodeURIComponent(token)}?subject=request`}>
              {payment.allowed_methods.includes("card") ? "Open secure checkout" : "Pay with Apple Pay"}
            </a> : null}
          {settings.payment_instructions && <p className={styles.muted} style={{ marginTop: 20 }}>{settings.payment_instructions}</p>}
          <p className={styles.secure}>Your card details are never entered on or stored by Oraya.</p>
        </>}
      </section>
      <p className={styles.footer}>Oraya · Luxury boutique villas in Lebanon</p>
    </div>
  </main>;
}
