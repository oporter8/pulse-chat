import { authorizeAppAdmin } from "@/lib/admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeAppAdmin(request);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const status = new URL(request.url).searchParams.get("status") || "all";

    let query = auth.admin
      .from("reports")
      .select("id,reporter_id,reported_user_id,message_id,reason,details,status,created_at,reviewed_at,reviewed_by")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status !== "all") query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return Response.json({ reports: data ?? [] });
  } catch (error) {
    console.error("Tiger admin reports lookup failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not load reports." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeAppAdmin(request);
    if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { reportId?: unknown; status?: unknown } | null;
    const reportId = typeof body?.reportId === "string" ? body.reportId : "";
    const status = typeof body?.status === "string" ? body.status : "";
    if (!/^[0-9a-f-]{36}$/i.test(reportId) || !/^(resolved|dismissed|open)$/.test(status)) {
      return Response.json({ error: "Invalid report update." }, { status: 400 });
    }

    const { error } = await auth.admin
      .from("reports")
      .update({
        status,
        reviewed_at: status === "open" ? null : new Date().toISOString(),
        reviewed_by: status === "open" ? null : auth.user.id,
      })
      .eq("id", reportId);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Tiger admin report update failed:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not update report." }, { status: 500 });
  }
}
