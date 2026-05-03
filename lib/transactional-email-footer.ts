import { SITE_URL } from "@/lib/brand";

const PUBLIC_CONTACT = "hello@stayoraya.com";
const GOLD = "#C5A46D";

/** Shared HTML block for transactional emails (contact + policy links + tagline). */
export function transactionalEmailFooterHtmlBlock(): string {
  const terms = `${SITE_URL}/legal/terms`;
  const payment = `${SITE_URL}/legal/payment`;
  const refund = `${SITE_URL}/legal/refund`;
  return `<div style="max-width:460px;margin:0 auto;text-align:center;">
<p style="margin:0 0 10px;font-size:11px;color:rgba(255,255,255,0.42);line-height:1.65;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<a href="mailto:${PUBLIC_CONTACT}" style="color:${GOLD};text-decoration:none;">${PUBLIC_CONTACT}</a>
<span style="color:rgba(255,255,255,0.22);"> · </span>
<a href="${terms}" style="color:rgba(255,255,255,0.42);text-decoration:underline;">Terms</a>
<span style="color:rgba(255,255,255,0.22);"> · </span>
<a href="${payment}" style="color:rgba(255,255,255,0.42);text-decoration:underline;">Payment</a>
<span style="color:rgba(255,255,255,0.22);"> · </span>
<a href="${refund}" style="color:rgba(255,255,255,0.42);text-decoration:underline;">Refund</a>
</p>
<p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Oraya - Luxury Boutique Villas - Lebanon</p>
</div>`;
}

/** Plain-text lines appended before join (contact, policies, tagline). */
export function transactionalEmailFooterTextSuffix(): string[] {
  return [
    `Reply or write us: ${PUBLIC_CONTACT}`,
    `Policies — Terms: ${SITE_URL}/legal/terms | Payment: ${SITE_URL}/legal/payment | Refund: ${SITE_URL}/legal/refund`,
    "Oraya - Luxury Boutique Villas - Lebanon",
  ];
}
