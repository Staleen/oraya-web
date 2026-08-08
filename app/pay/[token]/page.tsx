import Image from "next/image";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findPublicPaymentRequest } from "@/lib/payments/ledger-server";
import { formatPaymentAmount, remainingRequestAmount, type PaymentAllowedMethod } from "@/lib/payments/ledger";
import { PAYMENT_PUBLIC_SETTINGS_KEY, parsePaymentPublicSettings } from "@/lib/payments/settings";
import { getHostedCheckoutPublicStatus } from "@/lib/payments/runtime";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const labels: Record<PaymentAllowedMethod, string> = {
  cash: "Cash", bank_transfer: "Bank transfer", card: "Credit or debit card", apple_pay: "Apple Pay",
  whish: "Whish", omt: "OMT Pay", western_union: "Western Union", suyool: "Suyool",
};

export default async function PaymentRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payment = await findPublicPaymentRequest(token).catch(() => null);
  if (!payment) notFound();
  const [{ data: settingRow }, checkoutStatus] = await Promise.all([
    supabaseAdmin.from("settings").select("value").eq("key", PAYMENT_PUBLIC_SETTINGS_KEY).maybeSingle(),
    getHostedCheckoutPublicStatus(),
  ]);
  const settings = parsePaymentPublicSettings(settingRow?.value ?? null);
  const remaining = remainingRequestAmount(payment.amount, payment.amount_paid);
  const cardCheckoutReady = checkoutStatus.online_checkout_ready && checkoutStatus.provider_key === "credit_libanais";

  return <main className={styles.page}>
    <div className={styles.shell}>
      <Image className={styles.logo} src="/logos/ORAYA_logo_full.png" width={160} height={160} alt="Oraya" priority />
      <section className={styles.card}>
        {!payment.payable ? <div className={styles.closed}>
          <p className={styles.eyebrow}>Payment request</p>
          <h2>{payment.status === "paid" ? "Payment received" : "This link is no longer active"}</h2>
          <p className={styles.muted}>{payment.status === "paid" ? "Thank you. This request has been paid." : "Please contact Oraya if you still need to make this payment."}</p>
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
                    : method === "card" && cardCheckoutReady ? "Pay securely through Credit Libanais / NetCommerce."
                      : method === "card" || method === "apple_pay" ? "Secure online checkout will appear here when the payment provider is enabled."
                      : `Contact the Oraya team to complete this payment through ${labels[method]}.`}
              </p>
            </div>)}
          </div>
          {payment.allowed_methods.includes("card") && cardCheckoutReady ?
            <a className={styles.payButton} href={`/payments/checkout/${encodeURIComponent(token)}?subject=request`}>
              Pay securely by card
            </a> : null}
          {settings.payment_instructions && <p className={styles.muted} style={{ marginTop: 20 }}>{settings.payment_instructions}</p>}
          <p className={styles.secure}>Your card details are never entered on or stored by Oraya.</p>
        </>}
      </section>
      <p className={styles.footer}>Oraya · Luxury boutique villas in Lebanon</p>
    </div>
  </main>;
}
