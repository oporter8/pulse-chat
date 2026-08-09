import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey) throw new Error("Supabase server environment variables are missing.");
  return { url, publishableKey, secretKey };
}

async function authenticatedUser(request: Request) {
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
  return { user: data.user, admin };
}

export async function GET(request: Request) {
  try {
    const auth = await authenticatedUser(request);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const [{ data: adminRow, error: adminError }, { data: accessRow, error: accessError }] = await Promise.all([
      auth.admin.from("app_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
      auth.admin
        .from("app_access")
        .select("access_type,granted_at,amount_paid_cents,revoked_at")
        .eq("user_id", auth.user.id)
        .maybeSingle(),
    ]);

    if (adminError) throw adminError;
    if (accessError) throw accessError;

    const isAdmin = Boolean(adminRow);
    const activeGrant = Boolean(accessRow && !accessRow.revoked_at);
    const hasAccess = isAdmin || activeGrant;

    return Response.json({
      hasAccess,
      accessType: isAdmin ? "admin" : activeGrant ? accessRow?.access_type ?? null : null,
      grantedAt: activeGrant ? accessRow?.granted_at ?? null : null,
      amountPaidCents: activeGrant ? accessRow?.amount_paid_cents ?? null : null,
    });
  } catch (error) {
    console.error("Pulse billing access check failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not check access." }, { status: 500 });
  }
}
