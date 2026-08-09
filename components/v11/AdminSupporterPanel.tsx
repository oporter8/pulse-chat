"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type UserRow = { id: string; username: string; display_name: string; supporter: boolean; supporter_since: string | null; supporter_label: string };
type Campaign = { id: string; title: string; description: string; goal_cents: number; raised_cents: number; active: boolean };

export function AdminSupporterPanel({ userId }: { userId: string }) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [amount, setAmount] = useState("3.00");
  const [contributionUser, setContributionUser] = useState("");
  const [contributionNote, setContributionNote] = useState("");
  const [message, setMessage] = useState("");

  async function loadCampaign() {
    const { data } = await supabase.from("support_campaigns").select("id,title,description,goal_cents,raised_cents,active").eq("active", true).limit(1).maybeSingle();
    setCampaign((data ?? null) as Campaign | null);
  }
  useEffect(() => { void loadCampaign(); }, []);

  async function search() {
    const { data, error } = await supabase.rpc("search_supporter_admin", { query_text: query.trim() });
    if (error) { setMessage(error.message); return; }
    setUsers((data ?? []) as UserRow[]);
  }

  async function setSupporter(row: UserRow, enabled: boolean) {
    const { error } = await supabase.rpc("set_supporter", { target_user: row.id, enabled, label: row.supporter_label || "SUPPORTER" });
    setMessage(error ? error.message : `${row.username} is ${enabled ? "now a supporter" : "no longer a supporter"}.`);
    if (!error) await search();
  }

  async function saveCampaign() {
    if (!campaign) return;
    const { error } = await supabase.from("support_campaigns").update({ title: campaign.title, description: campaign.description, goal_cents: campaign.goal_cents, raised_cents: campaign.raised_cents, updated_at: new Date().toISOString() }).eq("id", campaign.id);
    setMessage(error ? error.message : "Support Center totals saved.");
  }

  async function recordContribution() {
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { setMessage("Enter a valid amount."); return; }
    const target = users.find((u) => u.id === contributionUser);
    const { error } = await supabase.from("support_contributions").insert({ user_id: contributionUser || null, amount_cents: cents, note: contributionNote.trim(), recorded_by: userId });
    if (error) { setMessage(error.message); return; }
    if (campaign) await supabase.from("support_campaigns").update({ raised_cents: campaign.raised_cents + cents, updated_at: new Date().toISOString() }).eq("id", campaign.id);
    if (target) await supabase.rpc("set_supporter", { target_user: target.id, enabled: true, label: "SUPPORTER" });
    setMessage("Contribution recorded and supporter status granted when an account was selected.");
    setContributionNote(""); await loadCampaign(); await search();
  }

  return <div className="tiger-v11-grid">
    <section className="tiger-card tiger-span-2">
      <h3>Supporter access</h3><p>Use this after you verify a voluntary contribution or when you want to grant a supporter perk manually. This does not process payments.</p>
      <div className="tiger-inline-form"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Username or display name" onKeyDown={(e) => { if (e.key === "Enter") void search(); }} /><button className="primary-button" onClick={() => void search()}>Search</button></div>
      <div className="tiger-list">{users.map((row) => <div className="tiger-list-row" key={row.id}><span><strong>{row.display_name}</strong><small>@{row.username} · {row.supporter ? `⭐ ${row.supporter_label}` : "Free member"}</small></span><button className="secondary-button" onClick={() => void setSupporter(row, !row.supporter)}>{row.supporter ? "Remove supporter" : "Grant supporter"}</button></div>)}</div>
    </section>

    {campaign && <section className="tiger-card"><h3>Operating goal</h3><label>Title<input value={campaign.title} onChange={(e) => setCampaign({ ...campaign, title: e.target.value })} /></label><label>Description<textarea rows={4} value={campaign.description} onChange={(e) => setCampaign({ ...campaign, description: e.target.value })} /></label><label>Monthly goal ($)<input type="number" min="0" step="1" value={(campaign.goal_cents / 100).toFixed(2)} onChange={(e) => setCampaign({ ...campaign, goal_cents: Math.max(0, Math.round(Number(e.target.value || 0) * 100)) })} /></label><label>Raised ($)<input type="number" min="0" step="0.01" value={(campaign.raised_cents / 100).toFixed(2)} onChange={(e) => setCampaign({ ...campaign, raised_cents: Math.max(0, Math.round(Number(e.target.value || 0) * 100)) })} /></label><button className="primary-button" onClick={() => void saveCampaign()}>Save goal</button></section>}

    <section className="tiger-card"><h3>Record verified support</h3><label>Account (optional)<select value={contributionUser} onChange={(e) => setContributionUser(e.target.value)}><option value="">Anonymous / no account</option>{users.map((row) => <option key={row.id} value={row.id}>@{row.username}</option>)}</select></label><label>Amount ($)<input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></label><label>Private admin note<input value={contributionNote} onChange={(e) => setContributionNote(e.target.value)} maxLength={200} placeholder="Optional reference" /></label><button className="primary-button" onClick={() => void recordContribution()}>Record contribution</button><small>This is bookkeeping only. It does not charge anyone.</small></section>
    {message && <p className="tiger-notice tiger-span-2">{message}</p>}
  </div>;
}
