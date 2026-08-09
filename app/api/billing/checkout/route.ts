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

async function authorize(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  const cfg = config();
  const client = createClient(cfg.url, cfg.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const admin = createClient(cfg.url, cfg.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return { user: data.user, admin, stripe: new Stripe(cfg.stripeSecretKey) };
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [{ data: adminRow }, { data: accessRow }] = await Promise.all([
      auth.admin.from("app_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
      auth.admin.from("app_access").select("access_type,revoked_at").eq("user_id", auth.user.id).maybeSingle(),
    ]);
    if (adminRow || (accessRow && !accessRow.revoked_at)) return Response.json({ alreadyHasAccess: true });
    if (!auth.user.email) return Response.json({ error: "Your account needs an email address before checkout." }, { status: 400 });

    const origin = new URL(request.url).origin;
    const session = await auth.stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["cashapp"],
      client_reference_id: auth.user.id,
      customer_email: auth.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: ACCESS_PRICE_CENTS,
            product_data: {
              name: "Tiger Chat Access",
              description: "One-time payment for permanent Tiger Chat access.",
            },
          },
        },
      ],
      metadata: {
        pulse_user_id: auth.user.id,
        access_product: "tiger_chat_lifetime_v1",
        payment_provider: "cashapp",
      },
      success_url: `${origin}/paywall?cashapp_success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/paywall?canceled=1`,
    });

    if (!session.url) throw new Error("Stripe did not return a Cash App checkout URL.");
    return Response.json({ url: session.url });
  } catch (error) {
    console.error("Tiger Chat Cash App checkout creation failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not start Cash App checkout." }, { status: 500 });
  }
}
