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
  const { data: adminRow } = await admin.from("app_admins").select("user_id").eq("user_id", data.user.id).maybeSingle();
  if (!adminRow) return null;
  return { user: data.user, admin };
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
    const { data: authData, error: authError } = await auth.admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (authError) throw authError;

    const authUsers = authData.users;
    const ids = authUsers.map((user) => user.id);

    const { data: profiles } = ids.length
      ? await auth.admin.from("profiles").select("id, username, display_name, avatar_path, admin_tag, created_at").in("id", ids)
      : { data: [] as Array<Record<string, unknown>> };

    const { data: adminRows } = ids.length
      ? await auth.admin.from("app_admins").select("user_id").in("user_id", ids)
      : { data: [] as Array<Record<string, unknown>> };

    const profileById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
    const adminIds = new Set((adminRows ?? []).map((row: any) => row.user_id));

    const users = authUsers
      .map((user) => {
        const profile: any = profileById.get(user.id);
        return {
          id: user.id,
          email: user.email ?? "",
          username: profile?.username ?? "",
          display_name: profile?.display_name ?? profile?.username ?? "User",
          avatar_path: profile?.avatar_path ?? null,
          admin_tag: profile?.admin_tag ?? null,
          created_at: profile?.created_at ?? user.created_at,
          last_sign_in_at: user.last_sign_in_at ?? null,
          banned_until: user.banned_until ?? null,
          is_admin: adminIds.has(user.id),
        };
      })
      .filter((user) => {
        if (!q) return true;
        return [user.email, user.username, user.display_name].some((value) => value.toLowerCase().includes(q));
      })
      .slice(0, 50);

    return Response.json({ users });
  } catch (error) {
    console.error("Pulse admin user lookup failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Admin lookup failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as { userId?: unknown; banDuration?: unknown } | null;
    const userId = typeof body?.userId === "string" ? body.userId : "";
    const banDuration = typeof body?.banDuration === "string" ? body.banDuration : "";

    if (!/^[0-9a-f-]{36}$/i.test(userId)) return Response.json({ error: "Invalid user id." }, { status: 400 });
    if (!/^(none|24h|168h|876000h)$/.test(banDuration)) return Response.json({ error: "Invalid suspension duration." }, { status: 400 });
    if (userId === auth.user.id) return Response.json({ error: "You cannot suspend your own admin account." }, { status: 400 });

    const { error } = await auth.admin.auth.admin.updateUserById(userId, { ban_duration: banDuration });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Pulse admin action failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Admin action failed." }, { status: 500 });
  }
}
