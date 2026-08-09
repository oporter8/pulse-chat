import { createClient } from "@supabase/supabase-js";

export function adminServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey) {
    throw new Error("Supabase server environment variables are missing.");
  }
  return { url, publishableKey, secretKey };
}

export async function authorizeAppAdmin(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  const cfg = adminServerConfig();
  const authClient = createClient(cfg.url, cfg.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return null;

  const admin = createClient(cfg.url, cfg.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: adminRow, error: adminError } = await admin
    .from("app_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (adminError || !adminRow) return null;
  return { user: data.user, admin };
}
