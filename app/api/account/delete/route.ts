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

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const token = authorization.slice("Bearer ".length).trim();
    const cfg = config();
    const client = createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
    if (body?.confirmation !== "DELETE") return Response.json({ error: "Type DELETE to confirm." }, { status: 400 });

    const admin = createClient(cfg.url, cfg.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
    if (deleteError) throw deleteError;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Pulse account deletion failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete account." }, { status: 500 });
  }
}
