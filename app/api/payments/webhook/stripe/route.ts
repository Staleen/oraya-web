import { handleHostedCheckoutWebhook } from "@/lib/payments/webhook-handler";

export async function POST(request: Request) {
  return handleHostedCheckoutWebhook("stripe", request);
}
