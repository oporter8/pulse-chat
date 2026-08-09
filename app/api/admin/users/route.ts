import { authorizeAppAdmin } from "@/lib/admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAppAdmin(request);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
    const { data: authData, error: authError } = await auth.admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (authError) throw authError;

    const ids = authData.users.map((user) => user.id);
    let profiles: Array<Record<string, any>> = [];
    let adminRows: Array<Record<string, any>> = [];

    if (ids.length) {
      const [profileResult, adminResult] = await Promise.all([
        auth.admin
          .from("profiles")
          .select("id,username,display_name,admin_tag,status_text,last_active_at,created_at,supporter,supporter_since,supporter_label,profile_emoji")
          .in("id", ids),
        auth.admin.from("app_admins").select("user_id").in("user_id", ids),
      ]);
      if (profileResult.error) throw profileResult.error;
      if (adminResult.error) throw adminResult.error;
      profiles = profileResult.data ?? [];
      adminRows = adminResult.data ?? [];
    }

    const profileById = new Map(profiles.map((profile: any) => [profile.id, profile]));
    const adminIds = new Set(adminRows.map((row: any) => row.user_id));

    const users = authData.users
      .map((user) => {
        const profile: any = profileById.get(user.id);
        return {
          id: user.id,
          email: user.email ?? "",
          username: profile?.username ?? "",
          display_name: profile?.display_name ?? profile?.username ?? "User",
          admin_tag: profile?.admin_tag ?? null,
          status_text: profile?.status_text ?? "",
          profile_emoji: profile?.profile_emoji ?? "🐯",
          last_active_at: profile?.last_active_at ?? null,
          created_at: profile?.created_at ?? user.created_at,
          last_sign_in_at: user.last_sign_in_at ?? null,
          banned_until: user.banned_until ?? null,
          is_admin: adminIds.has(user.id),
          supporter: Boolean(profile?.supporter),
          supporter_since: profile?.supporter_since ?? null,
          supporter_label: profile?.supporter_label ?? "SUPPORTER",
        };
      })
      .filter((user) => {
        if (!q) return true;
        return [user.email, user.username, user.display_name].some((value) => value.toLowerCase().includes(q));
      })
      .slice(0, 50);

    return Response.json({ users });
  } catch (error) {
    console.error("Tiger admin user lookup failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Admin lookup failed." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAppAdmin(request);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as {
      userId?: unknown;
      banDuration?: unknown;
      supporterAction?: unknown;
      supporterLabel?: unknown;
    } | null;

    const userId = typeof body?.userId === "string" ? body.userId : "";
    const banDuration = typeof body?.banDuration === "string" ? body.banDuration : "";
    const supporterAction = typeof body?.supporterAction === "string" ? body.supporterAction : "";
    const supporterLabel = typeof body?.supporterLabel === "string" ? body.supporterLabel.trim().slice(0, 16) : "SUPPORTER";

    if (!/^[0-9a-f-]{36}$/i.test(userId)) return Response.json({ error: "Invalid user id." }, { status: 400 });

    if (supporterAction) {
      if (!/^(grant|remove)$/.test(supporterAction)) {
        return Response.json({ error: "Invalid supporter action." }, { status: 400 });
      }
      const enabled = supporterAction === "grant";
      const { error } = await auth.admin
        .from("profiles")
        .update({
          supporter: enabled,
          supporter_since: enabled ? new Date().toISOString() : null,
          supporter_label: supporterLabel || "SUPPORTER",
          profile_frame: enabled ? "supporter" : "none",
        })
        .eq("id", userId);
      if (error) throw error;

      if (!enabled) {
        const { data: loungeRows } = await auth.admin
          .from("conversations")
          .select("id")
          .eq("supporter_only", true);
        const loungeIds = (loungeRows ?? []).map((row: any) => row.id);
        if (loungeIds.length) {
          await auth.admin.from("conversation_members").delete().eq("user_id", userId).in("conversation_id", loungeIds);
        }
      }
      return Response.json({ ok: true, supporter: enabled });
    }

    if (!/^(none|24h|168h|876000h)$/.test(banDuration)) {
      return Response.json({ error: "Invalid suspension duration." }, { status: 400 });
    }
    if (userId === auth.user.id) return Response.json({ error: "You cannot suspend your own admin account." }, { status: 400 });

    const { error } = await auth.admin.auth.admin.updateUserById(userId, { ban_duration: banDuration });
    if (error) throw error;

    if (banDuration !== "none") {
      const { error: deviceError } = await auth.admin
        .from("device_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("revoked_at", null);
      if (deviceError) throw deviceError;
    }

    return Response.json({ ok: true, suspended: banDuration !== "none" });
  } catch (error) {
    console.error("Tiger admin action failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Admin action failed." }, { status: 500 });
  }
}
