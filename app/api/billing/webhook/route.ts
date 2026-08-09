import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_PRICE_CENTS = 300;

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!url || !secretKey) throw new Error("Supabase server environment variables are missing.");
  if (!stripeSecretKey || !webhookSecret) throw new Error("Stripe server environment variables are missing.");
  return { url, secretKey, stripeSecretKey, webhookSecret };
}

async function grantSession(session: Stripe.Checkout.Session) {
  const cfg = config();
  const userId = session.client_reference_id || session.metadata?.pulse_user_id;
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("Checkout session has no valid Tiger Chat user id.");
  if (session.payment_status !== "paid") return;
  if (session.currency !== "usd" || session.amount_total !== ACCESS_PRICE_CENTS) throw new Error("Checkout amount does not match the Tiger Chat access price.");
  if (session.metadata?.payment_provider !== "cashapp") throw new Error("Unexpected Stripe payment method.");

  const admin = createClient(cfg.url, cfg.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const { error } = await admin.from("app_access").upsert({
    user_id: userId,
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
  if (error) throw error;
}

export async function POST(request: Request) {
  try {
    const cfg = config();
    const signature = request.headers.get("stripe-signature");
    if (!signature) return new Response("Missing Stripe signature", { status: 400 });

    const payload = await request.text();
    const stripe = new Stripe(cfg.stripeSecretKey);
    const event = stripe.webhooks.constructEvent(payload, signature, cfg.webhookSecret);

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await grantSession(event.data.object as Stripe.Checkout.Session);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Tiger Chat Stripe webhook failed:", error);
    return new Response(error instanceof Error ? error.message : "Webhook failed", { status: 400 });
  }
}
