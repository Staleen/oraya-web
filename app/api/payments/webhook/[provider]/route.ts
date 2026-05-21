import { handleHostedCheckoutWebhook } from "@/lib/payments/webhook-handler";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;
  return handleHostedCheckoutWebhook(provider, request);
}
