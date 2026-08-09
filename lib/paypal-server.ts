const ACCESS_PRICE = "3.00";
const ACCESS_PRICE_CENTS = 300;

type PayPalEnvironment = "sandbox" | "live";

export function paypalConfig(options?: { requireWebhookId?: boolean }) {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const env: PayPalEnvironment = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";

  if (!clientId || !clientSecret) {
    throw new Error("PayPal server environment variables are missing.");
  }
  if (options?.requireWebhookId && !webhookId) {
    throw new Error("PAYPAL_WEBHOOK_ID is missing.");
  }

  return {
    clientId,
    clientSecret,
    webhookId: webhookId ?? null,
    env,
    apiBase: env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
  };
}

export async function paypalAccessToken() {
  const cfg = paypalConfig();
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const response = await fetch(`${cfg.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description || "Could not authenticate with PayPal.");
  }

  return { ...cfg, accessToken: body.access_token };
}

export async function verifyPayPalWebhook(request: Request, webhookEvent: unknown) {
  const paypal = await paypalAccessToken();
  const cfg = paypalConfig({ requireWebhookId: true });

  const transmissionId = request.headers.get("paypal-transmission-id");
  const transmissionTime = request.headers.get("paypal-transmission-time");
  const certUrl = request.headers.get("paypal-cert-url");
  const authAlgo = request.headers.get("paypal-auth-algo");
  const transmissionSig = request.headers.get("paypal-transmission-sig");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig || !cfg.webhookId) {
    return false;
  }

  const response = await fetch(`${paypal.apiBase}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paypal.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: cfg.webhookId,
      webhook_event: webhookEvent,
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => ({}))) as {
    verification_status?: string;
  };

  return response.ok && body.verification_status === "SUCCESS";
}

export { ACCESS_PRICE, ACCESS_PRICE_CENTS };
