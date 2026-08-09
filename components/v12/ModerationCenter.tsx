"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AdminSupporterPanel } from "@/components/v11/AdminSupporterPanel";

type AdminUser = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  admin_tag: string | null;
  status_text: string;
  profile_emoji: string;
  last_active_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  is_admin: boolean;
  supporter: boolean;
  supporter_since: string | null;
  supporter_label: string;
};

type Report = {
  id: string;
  reporter_id: string;
  reported_user_id: string | null;
  message_id: string | null;
  reason: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type Tab = "accounts" | "reports" | "support" | "owner";

async function adminFetch(url: string, options?: RequestInit) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired. Sign in again.");
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Admin request failed.");
  return body;
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
}

export function ModerationCenter() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState("");
  const [tab, setTab] = useState<Tab>("accounts");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [reportFilter, setReportFilter] = useState<"open" | "all" | "resolved" | "dismissed">("open");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [tag, setTag] = useState("OWNER");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/"); return; }
      const { data: admin, error } = await supabase.rpc("is_app_admin");
      if (error || !admin) { router.replace("/chat"); return; }
      setUserId(data.user.id);
      const { data: profile } = await supabase.from("profiles").select("admin_tag").eq("id", data.user.id).maybeSingle();
      setTag(String(profile?.admin_tag || "OWNER"));
      setReady(true);
    })();
  }, [router]);

  const loadUsers = useCallback(async (search: string) => {
    setLoadingUsers(true); setMessage("");
    try {
      const body = await adminFetch(`/api/admin/users?q=${encodeURIComponent(search.trim())}`);
      setUsers((body.users ?? []) as AdminUser[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load users.");
    } finally { setLoadingUsers(false); }
  }, []);

  const loadReports = useCallback(async (filter: "open" | "all" | "resolved" | "dismissed") => {
    setLoadingReports(true); setMessage("");
    try {
      const body = await adminFetch(`/api/admin/reports?status=${encodeURIComponent(filter)}`);
      setReports((body.reports ?? []) as Report[]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load reports.");
    } finally { setLoadingReports(false); }
  }, []);

  useEffect(() => { if (ready) void loadUsers(""); }, [ready, loadUsers]);
  useEffect(() => { if (ready) void loadReports(reportFilter); }, [ready, reportFilter, loadReports]);

  async function searchUsers(event?: FormEvent) {
    event?.preventDefault();
    await loadUsers(query);
  }

  async function setBan(target: AdminUser, duration: "none" | "24h" | "168h" | "876000h") {
    if (target.id === userId) return;
    const destructive = duration === "876000h";
    if (destructive && !window.confirm(`Ban @${target.username}? Active Tiger Chat device sessions will be revoked.`)) return;
    setWorkingId(target.id); setMessage("");
    try {
      await adminFetch("/api/admin/users", { method: "POST", body: JSON.stringify({ userId: target.id, banDuration: duration }) });
      await loadUsers(query);
      setMessage(duration === "none" ? `@${target.username} is active again.` : `@${target.username} suspension updated.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change suspension.");
    } finally { setWorkingId(null); }
  }

  async function toggleSupporter(target: AdminUser) {
    setWorkingId(target.id); setMessage("");
    try {
      await adminFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ userId: target.id, supporterAction: target.supporter ? "remove" : "grant", supporterLabel: target.supporter_label || "SUPPORTER" }),
      });
      await loadUsers(query);
      setMessage(target.supporter ? `Supporter status removed from @${target.username}.` : `Supporter status granted to @${target.username}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update supporter status.");
    } finally { setWorkingId(null); }
  }

  async function updateReport(reportId: string, status: "open" | "resolved" | "dismissed") {
    setWorkingId(reportId); setMessage("");
    try {
      await adminFetch("/api/admin/reports", { method: "POST", body: JSON.stringify({ reportId, status }) });
      await loadReports(reportFilter);
      setMessage(`Report marked ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update report.");
    } finally { setWorkingId(null); }
  }

  async function saveTag() {
    const clean = tag.trim();
    if (!/^[A-Za-z0-9 _-]{1,16}$/.test(clean)) { setMessage("Owner tag must be 1–16 characters."); return; }
    const { error } = await supabase.rpc("set_my_admin_tag", { new_tag: clean });
    setMessage(error ? error.message : "Owner tag saved.");
  }

  const stats = useMemo(() => ({
    accounts: users.length,
    suspended: users.filter((user) => Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now())).length,
    supporters: users.filter((user) => user.supporter).length,
    openReports: reports.filter((report) => report.status === "open").length,
  }), [reports, users]);

  if (!ready) return <main className="tiger-v12-page"><div className="v12-loading-card">Checking admin access…</div></main>;

  return <main className="tiger-v12-page moderation-v12">
    <header className="v12-page-header">
      <div><p className="v12-kicker">Administration</p><h1>Moderation Center</h1><p>Accounts, reports, supporter status, and project support in one place.</p></div>
      <button className="secondary-button" onClick={() => router.push("/chat")}>Back to chat</button>
    </header>

    <section className="v12-stat-strip" aria-label="Moderation summary">
      <div><strong>{stats.accounts}</strong><span>Loaded accounts</span></div>
      <div><strong>{stats.suspended}</strong><span>Suspended</span></div>
      <div><strong>{stats.supporters}</strong><span>Supporters</span></div>
      <div><strong>{stats.openReports}</strong><span>Open reports</span></div>
    </section>

    <nav className="v12-segmented-tabs" aria-label="Moderation sections">
      {([[
        "accounts", "Accounts"
      ], ["reports", "Reports"], ["support", "Support"], ["owner", "Owner settings"]] as [Tab, string][]).map(([key, label]) =>
        <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
      )}
    </nav>

    {tab === "accounts" && <section className="v12-panel">
      <div className="v12-panel-heading"><div><h2>Account management</h2><p>Search users, suspend accounts, and control optional supporter status.</p></div></div>
      <form className="v12-search-row" onSubmit={searchUsers}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, username, or email" />
        <button className="primary-button" disabled={loadingUsers}>{loadingUsers ? "Searching…" : "Search"}</button>
      </form>
      <div className="v12-admin-table" role="list">
        {users.map((adminUser) => {
          const banned = Boolean(adminUser.banned_until && new Date(adminUser.banned_until).getTime() > Date.now());
          return <article className="v12-user-card" key={adminUser.id} role="listitem">
            <div className="v12-user-identity"><span className="v12-avatar">{adminUser.profile_emoji || "🐯"}</span><span><strong>{adminUser.display_name}</strong><small>@{adminUser.username} · {adminUser.email || "No email"}</small></span></div>
            <div className="v12-pill-row">
              {adminUser.is_admin && <span className="v12-pill admin">Admin</span>}
              {adminUser.supporter && <span className="v12-pill supporter">⭐ {adminUser.supporter_label}</span>}
              <span className={`v12-pill ${banned ? "danger" : "good"}`}>{banned ? `Suspended · ${formatDate(adminUser.banned_until)}` : "Active"}</span>
            </div>
            <div className="v12-user-meta"><span>Last sign-in<strong>{formatDate(adminUser.last_sign_in_at)}</strong></span><span>Last active<strong>{formatDate(adminUser.last_active_at)}</strong></span></div>
            {adminUser.id !== userId && <div className="v12-action-grid">
              {!adminUser.is_admin && <button className={adminUser.supporter ? "secondary-button" : "primary-button"} disabled={workingId === adminUser.id} onClick={() => void toggleSupporter(adminUser)}>{adminUser.supporter ? "Remove supporter" : "Grant supporter"}</button>}
              {banned ? <button className="secondary-button" disabled={workingId === adminUser.id} onClick={() => void setBan(adminUser, "none")}>Restore account</button> : <>
                <button className="secondary-button" disabled={workingId === adminUser.id} onClick={() => void setBan(adminUser, "24h")}>Suspend 24h</button>
                <button className="secondary-button" disabled={workingId === adminUser.id} onClick={() => void setBan(adminUser, "168h")}>Suspend 7d</button>
                <button className="danger-button secondary-danger" disabled={workingId === adminUser.id} onClick={() => void setBan(adminUser, "876000h")}>Ban</button>
              </>}
            </div>}
          </article>;
        })}
        {!loadingUsers && users.length === 0 && <div className="v12-empty">No accounts matched your search.</div>}
      </div>
    </section>}

    {tab === "reports" && <section className="v12-panel">
      <div className="v12-panel-heading"><div><h2>Reports</h2><p>Review reports without squeezing them into the Settings modal.</p></div><select value={reportFilter} onChange={(event) => setReportFilter(event.target.value as typeof reportFilter)}><option value="open">Open</option><option value="all">All</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></div>
      <div className="v12-report-list">
        {reports.map((report) => <article className="v12-report-card" key={report.id}>
          <div className="v12-report-top"><span className={`v12-pill ${report.status === "open" ? "warning" : "neutral"}`}>{report.status}</span><strong>{report.reason}</strong><time>{formatDate(report.created_at)}</time></div>
          <p>{report.details || "No additional details were supplied."}</p>
          <div className="v12-report-refs"><span>Reported user: <code>{report.reported_user_id || "—"}</code></span><span>Message: <code>{report.message_id || "—"}</code></span></div>
          <div className="v12-action-row">
            {report.status !== "dismissed" && <button className="secondary-button" disabled={workingId === report.id} onClick={() => void updateReport(report.id, "dismissed")}>Dismiss</button>}
            {report.status !== "resolved" && <button className="primary-button" disabled={workingId === report.id} onClick={() => void updateReport(report.id, "resolved")}>Resolve</button>}
            {report.status !== "open" && <button className="secondary-button" disabled={workingId === report.id} onClick={() => void updateReport(report.id, "open")}>Reopen</button>}
          </div>
        </article>)}
        {!loadingReports && reports.length === 0 && <div className="v12-empty">No reports in this view.</div>}
      </div>
    </section>}

    {tab === "support" && <section className="v12-panel v12-support-admin"><div className="v12-panel-heading"><div><h2>Support operations</h2><p>Record verified support and manage the operating goal. This screen does not charge anyone.</p></div></div><AdminSupporterPanel userId={userId} /></section>}

    {tab === "owner" && <section className="v12-panel v12-owner-settings"><div className="v12-panel-heading"><div><h2>Owner identity</h2><p>Keep the owner badge short so it fits consistently in messages and member lists.</p></div></div><label>Owner badge<input value={tag} onChange={(event) => setTag(event.target.value)} maxLength={16} /></label><div className="v12-action-row"><span className="admin-badge-v7">{tag.trim() || "OWNER"}</span><button className="primary-button" onClick={() => void saveTag()}>Save badge</button></div></section>}

    {message && <div className="v12-toast" role="status">{message}</div>}
  </main>;
}
