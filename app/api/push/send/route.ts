import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MemberRow = { user_id: string; muted_until: string | null };
type RecipientProfile = { id: string; notifications_enabled: boolean; notification_preview: boolean; dnd_until: string | null };
type SubscriptionRow = { endpoint: string; p256dh: string; auth: string; user_id: string };

function serverConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serverSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!supabaseUrl || !publishableKey || !serverSecretKey) throw new Error("Supabase server environment variables are missing.");
  if (!publicKey || !privateKey || !subject) throw new Error("VAPID environment variables are missing.");
  return { supabaseUrl, publishableKey, serverSecretKey, publicKey, privateKey, subject };
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const token = authorization.slice("Bearer ".length).trim();
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { messageId?: unknown } | null;
    const messageId = typeof body?.messageId === "string" ? body.messageId : "";
    if (!/^[0-9a-f-]{36}$/i.test(messageId)) return Response.json({ error: "Invalid message id" }, { status: 400 });

    const config = serverConfig();
    const authClient = createClient(config.supabaseUrl, config.publishableKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createClient(config.supabaseUrl, config.serverSecretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const { data: message, error: messageError } = await admin.from("messages").select("id,conversation_id,sender_id,body,deleted_at").eq("id", messageId).single();
    if (messageError || !message || message.sender_id !== userData.user.id || message.deleted_at) return Response.json({ error: "Message not available" }, { status: 403 });

    const { error: dispatchError } = await admin.from("push_dispatches").insert({ message_id: message.id });
    if (dispatchError) {
      if (dispatchError.code === "23505") return Response.json({ sent: 0, failed: 0, alreadyDispatched: true });
      throw dispatchError;
    }

    const [{ data: conversation }, { data: sender }] = await Promise.all([
      admin.from("conversations").select("id,kind,name").eq("id", message.conversation_id).single(),
      admin.from("profiles").select("id,display_name,username").eq("id", message.sender_id).single(),
    ]);
    if (!conversation || !sender) return Response.json({ sent: 0, failed: 0 });

    const { data: memberRows } = await admin.from("conversation_members").select("user_id,muted_until").eq("conversation_id", message.conversation_id).neq("user_id", message.sender_id);
    const now = Date.now();
    const unmutedIds = ((memberRows ?? []) as MemberRow[]).filter((member) => !member.muted_until || new Date(member.muted_until).getTime() <= now).map((member) => member.user_id);
    if (!unmutedIds.length) return Response.json({ sent: 0, failed: 0 });

    const { data: profileRows } = await admin.from("profiles").select("id,notifications_enabled,notification_preview,dnd_until").in("id", unmutedIds);
    const recipientProfiles = new Map(((profileRows ?? []) as RecipientProfile[])
      .filter((profile) => profile.notifications_enabled)
      .filter((profile) => !profile.dnd_until || new Date(profile.dnd_until).getTime() <= now)
      .map((profile) => [profile.id, profile]));
    const eligibleIds = [...recipientProfiles.keys()];
    if (!eligibleIds.length) return Response.json({ sent: 0, failed: 0, dndFiltered: true });

    const { data: subscriptionRows } = await admin.from("push_subscriptions").select("endpoint,p256dh,auth,user_id").in("user_id", eligibleIds);
    const subscriptions = (subscriptionRows ?? []) as SubscriptionRow[];
    if (!subscriptions.length) return Response.json({ sent: 0, failed: 0 });

    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    const senderName = sender.display_name || sender.username || "Tiger user";
    const title = conversation.kind === "group" ? conversation.name || "Tiger Chat" : senderName;
    const clickUrl = `/chat?conversation=${message.conversation_id}`;

    const deliveries = subscriptions.map(async (subscription) => {
      const recipient = recipientProfiles.get(subscription.user_id);
      const notificationBody = recipient?.notification_preview ? (message.body?.trim() ? message.body.trim().slice(0, 140) : `${senderName} sent a voice note or file`) : "New message";
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title, body: notificationBody, url: clickUrl, tag: `tiger-${message.id}` }), { TTL: 60 * 60 });
        return { ok: true as const };
      } catch (deliveryError) {
        const statusCode = typeof deliveryError === "object" && deliveryError !== null && "statusCode" in deliveryError ? Number((deliveryError as { statusCode?: unknown }).statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) await admin.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        console.warn("Tiger push delivery failed", { statusCode, userId: subscription.user_id });
        return { ok: false as const };
      }
    });

    const results = await Promise.all(deliveries);
    return Response.json({ sent: results.filter((result) => result.ok).length, failed: results.filter((result) => !result.ok).length });
  } catch (error) {
    console.error("Tiger push send failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Push delivery failed." }, { status: 500 });
  }
}
