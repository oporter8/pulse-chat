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

export async function POST(request: Request) {
  try {
    const auth = await authUser(request);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [{ data: adminRow }, { data: accessRow }] = await Promise.all([
      auth.admin.from("app_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
      auth.admin.from("app_access").select("revoked_at").eq("user_id", auth.user.id).maybeSingle(),
    ]);
    if (adminRow || (accessRow && !accessRow.revoked_at)) return Response.json({ alreadyHasAccess: true });

    const paypal = await paypalAccessToken();
    const response = await fetch(`${paypal.apiBase}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paypal.accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `tiger-${auth.user.id}-${Date.now()}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          custom_id: auth.user.id,
          description: "Tiger Chat lifetime access",
          amount: { currency_code: "USD", value: ACCESS_PRICE },
        }],
        application_context: { shipping_preference: "NO_SHIPPING" },
      }),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok || !body.id) throw new Error(body.message || "Could not create PayPal order.");
    return Response.json({ orderId: body.id });
  } catch (error) {
    console.error("Tiger Chat PayPal order creation failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not create PayPal order." }, { status: 500 });
  }
}
