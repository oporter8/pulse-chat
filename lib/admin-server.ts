import { createClient } from "@supabase/supabase-js";

export type StaffRole = "owner" | "admin" | "moderator";
const RANK: Record<StaffRole, number> = { moderator: 1, admin: 2, owner: 3 };

export function adminServerConfig() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!publishableKey||!secretKey) throw new Error("Supabase server environment variables are missing.");
  return {url,publishableKey,secretKey};
}

export async function authorizeStaff(request: Request, minimum: StaffRole = "moderator") {
  const authorization=request.headers.get("authorization");
  if(!authorization?.startsWith("Bearer ")) return null;
  const token=authorization.slice("Bearer ".length).trim();
  if(!token) return null;
  const cfg=adminServerConfig();
  const authClient=createClient(cfg.url,cfg.publishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const {data,error}=await authClient.auth.getUser(token);
  if(error||!data.user) return null;
  const admin=createClient(cfg.url,cfg.secretKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const {data:profile,error:profileError}=await admin.from("profiles").select("staff_role").eq("id",data.user.id).maybeSingle();
  if(profileError) return null;
  const staffRole=profile?.staff_role as StaffRole | null;
  if(!staffRole || !RANK[staffRole] || RANK[staffRole] < RANK[minimum]) return null;
  return {user:data.user,admin,staffRole};
}

export async function authorizeAppAdmin(request: Request) { return authorizeStaff(request,"moderator"); }
export async function authorizeOwner(request: Request) { return authorizeStaff(request,"owner"); }
export function staffAtLeast(role: StaffRole, minimum: StaffRole) { return RANK[role] >= RANK[minimum]; }
