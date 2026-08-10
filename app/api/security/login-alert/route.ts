import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!url || !publishableKey || !secretKey) throw new Error("Supabase server environment variables are missing.");
  if (!publicKey || !privateKey || !subject) throw new Error("VAPID environment variables are missing.");
  return { url, publishableKey, secretKey, publicKey, privateKey, subject };
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const token = authorization.slice(7).trim();
    const body = (await request.json().catch(() => null)) as { deviceName?: unknown } | null;
    const deviceName = typeof body?.deviceName === "string" ? body.deviceName.trim().slice(0, 80) : "a new device";

    const cfg = config();
    const authClient = createClient(cfg.url, cfg.publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await authClient.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(cfg.url, cfg.secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    // register_device() writes this event. Require a fresh matching event so the
    // endpoint cannot be reused later to spam a user's own devices.
    const { data: latestEvent } = await admin
      .from("account_events")
      .select("id,created_at,detail")
      .eq("user_id", data.user.id)
      .eq("event_type", "new_device")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestEvent || Date.now() - new Date(latestEvent.created_at).getTime() > 2 * 60_000) {
      return Response.json({ sent: 0, skipped: true });
    }

    const { data: rows } = await admin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", data.user.id);
    const subscriptions = (rows ?? []) as SubscriptionRow[];
    if (subscriptions.length === 0) return Response.json({ sent: 0 });

    webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
    const payload = JSON.stringify({
      title: "New Tiger Chat sign-in",
      body: `Your account signed in on ${deviceName || latestEvent.detail || "a new device"}.`,
      url: "/chat?settings=security",
      tag: `pulse-login-${latestEvent.id}`,
    });

    let sent = 0;
    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 60 * 60 });
        sent += 1;
      } catch (deliveryError) {
        const statusCode = typeof deliveryError === "object" && deliveryError !== null && "statusCode" in deliveryError
          ? Number((deliveryError as { statusCode?: unknown }).statusCode)
          : 0;
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        }
      }
    }));

    return Response.json({ sent });
  } catch (error) {
    console.error("Pulse login alert failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Login alert failed." }, { status: 500 });
  }
}
