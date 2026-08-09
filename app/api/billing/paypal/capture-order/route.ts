import { createClient } from "@supabase/supabase-js";
import { ACCESS_PRICE, paypalAccessToken } from "@/lib/paypal-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey) throw new Error("Supabase server environment variables are missing.");
  return { url, publishableKey, secretKey };
}

async function authUser(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  const cfg = supabaseConfig();
  const client = createClient(cfg.url, cfg.publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const admin = createClient(cfg.url, cfg.secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { user: data.user, admin };
}

type PayPalCapture = {
  id?: string;
  status?: string;
  payment_source?: { venmo?: unknown; paypal?: unknown };
  purchase_units?: Array<{
    custom_id?: string;
    payments?: { captures?: Array<{ id?: string; status?: string; amount?: { currency_code?: string; value?: string } }> };
  }>;
  message?: string;
};

export async function POST(request: Request) {
  try {
    const auth = await authUser(request);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { orderId?: unknown } | null;
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    if (!/^[A-Z0-9-]{8,32}$/i.test(orderId)) return Response.json({ error: "Invalid PayPal order." }, { status: 400 });

    const paypal = await paypalAccessToken();
    const response = await fetch(`${paypal.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paypal.accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `tiger-capture-${orderId}`,
      },
      body: "{}",
    });
    const captured = await response.json().catch(() => ({})) as PayPalCapture;
    if (!response.ok) throw new Error(captured.message || "PayPal could not capture the payment.");

    const unit = captured.purchase_units?.[0];
    const capture = unit?.payments?.captures?.find((item) => item.status === "COMPLETED") ?? unit?.payments?.captures?.[0];
    if (unit?.custom_id !== auth.user.id) return Response.json({ error: "This payment belongs to a different Tiger Chat account." }, { status: 403 });
    if (captured.status !== "COMPLETED" || capture?.status !== "COMPLETED") return Response.json({ error: "PayPal payment is not complete." }, { status: 409 });
    if (capture.amount?.currency_code !== "USD" || capture.amount?.value !== ACCESS_PRICE) return Response.json({ error: "Unexpected PayPal payment amount." }, { status: 400 });
    if (!capture.id) throw new Error("PayPal capture reference is missing.");

    const paymentProvider = captured.payment_source?.venmo ? "venmo" : "paypal";
    const { error: grantError } = await auth.admin.from("app_access").upsert({
      user_id: auth.user.id,
      access_type: "paid",
      granted_at: new Date().toISOString(),
      granted_by: null,
      payment_provider: paymentProvider,
      payment_reference: capture.id,
      amount_paid_cents: 300,
      revoked_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (grantError) throw grantError;

    return Response.json({ ok: true, hasAccess: true, paymentProvider });
  } catch (error) {
    console.error("Tiger Chat PayPal/Venmo capture failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not capture payment." }, { status: 500 });
  }
}
