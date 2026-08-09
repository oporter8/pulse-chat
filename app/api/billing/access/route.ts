import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const token = authorization.slice("Bearer ".length).trim();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase public environment variables are missing.");
    const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // v11: Tiger Chat messaging is free. Supporter status only unlocks optional perks.
    return Response.json({ hasAccess: true, accessType: "free", grantedAt: null, amountPaidCents: null });
  } catch (error) {
    console.error("Tiger Chat access check failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not check access." }, { status: 500 });
  }
}
