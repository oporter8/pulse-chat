import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_PRICE_CENTS = 300;

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) throw new Error("Supabase server environment variables are missing.");
  if (!stripeSecretKey) throw new Error("STRIPE_SECRET_KEY is missing.");
  return { url, publishableKey, secretKey, stripeSecretKey };
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const token = authorization.slice("Bearer ".length).trim();
    const body = (await request.json().catch(() => null)) as { sessionId?: unknown } | null;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!/^cs_(test|live)_/.test(sessionId)) return Response.json({ error: "Invalid checkout session." }, { status: 400 });

    const cfg = config();
    const client = createClient(cfg.url, cfg.publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const stripe = new Stripe(cfg.stripeSecretKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.client_reference_id !== data.user.id) return Response.json({ error: "This checkout belongs to a different account." }, { status: 403 });
    if (session.payment_status !== "paid") return Response.json({ error: "Payment is not complete yet." }, { status: 409 });
    if (session.currency !== "usd" || session.amount_total !== ACCESS_PRICE_CENTS) return Response.json({ error: "Unexpected checkout amount." }, { status: 400 });
    if (session.metadata?.payment_provider !== "cashapp") return Response.json({ error: "Unexpected payment method." }, { status: 400 });

    const admin = createClient(cfg.url, cfg.secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    const { error: grantError } = await admin.from("app_access").upsert({
      user_id: data.user.id,
      access_type: "paid",
      granted_at: new Date().toISOString(),
      granted_by: null,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      payment_provider: "cashapp",
      payment_reference: session.id,
      amount_paid_cents: session.amount_total,
      revoked_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (grantError) throw grantError;

    return Response.json({ ok: true, hasAccess: true });
  } catch (error) {
    console.error("Tiger Chat Cash App verification failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not verify payment." }, { status: 500 });
  }
}
