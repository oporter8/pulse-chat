const ACCESS_PRICE = "3.00";

export function paypalConfig() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const env = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
  if (!clientId || !clientSecret) throw new Error("PayPal server environment variables are missing.");
  return {
    clientId,
    clientSecret,
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
  const body = await response.json().catch(() => ({})) as { access_token?: string; error_description?: string };
  if (!response.ok || !body.access_token) throw new Error(body.error_description || "Could not authenticate with PayPal.");
  return { ...cfg, accessToken: body.access_token };
}

export { ACCESS_PRICE };
