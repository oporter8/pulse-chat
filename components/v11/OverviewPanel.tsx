"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getV11ProfileStyle, type V11ProfileStyle } from "@/lib/v11-profile";

type Achievement = { achievement_key: string; unlocked_at: string; achievement_catalog?: { title?: string; description?: string; emoji?: string } | null };
type Campaign = { id: string; title: string; description: string; goal_cents: number; raised_cents: number };
type Streak = { user_a: string; user_b: string; current_streak: number; best_streak: number; last_active_date: string };

export function OverviewPanel({ userId, username }: { userId: string; username: string }) {
  const router = useRouter();
  const [style, setStyle] = useState<V11ProfileStyle | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [streaks, setStreaks] = useState<Streak[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void Promise.all([
      getV11ProfileStyle(userId, true),
      supabase.from("user_achievements").select("achievement_key,unlocked_at,achievement_catalog(title,description,emoji)").eq("user_id", userId).order("unlocked_at", { ascending: false }),
      supabase.from("support_campaigns").select("id,title,description,goal_cents,raised_cents").eq("active", true).limit(1).maybeSingle(),
      supabase.from("dm_streaks").select("user_a,user_b,current_streak,best_streak,last_active_date").or(`user_a.eq.${userId},user_b.eq.${userId}`).order("current_streak", { ascending: false }).limit(5),
    ]).then(([profileStyle, achievementResult, campaignResult, streakResult]) => {
      setStyle(profileStyle);
      setAchievements((achievementResult.data ?? []) as unknown as Achievement[]);
      setCampaign((campaignResult.data ?? null) as Campaign | null);
      setStreaks((streakResult.data ?? []) as Streak[]);
    });
  }, [userId]);

  async function joinLounge() {
    setNotice("");
    const { error } = await supabase.rpc("join_supporter_lounge");
    if (error) { setNotice(error.message); return; }
    setNotice("Supporter Lounge added to your conversations.");
    window.setTimeout(() => router.push("/chat"), 500);
  }

  async function copyProfile() {
    await navigator.clipboard.writeText(`${window.location.origin}/u/${username}`);
    setNotice("Profile link copied.");
  }

  async function exportAccount() {
    setNotice("Preparing your export…");
    try {
      const { data: memberships, error: membershipError } = await supabase.from("conversation_members").select("conversation_id,role,joined_at,last_read_at,muted_until,pinned_at,archived_at,cleared_at,hidden_at,favorite").eq("user_id", userId);
      if (membershipError) throw membershipError;
      const conversationIds = (memberships ?? []).map((row: any) => String(row.conversation_id));
      const exportData: Record<string, unknown> = { exported_at: new Date().toISOString(), user_id: userId, conversation_members: memberships ?? [] };
      const ownTables = ["profiles","saved_messages","user_achievements","text_stories","scheduled_messages","conversation_folders","close_friends","user_themes","legal_acceptances"] as const;
      for (const table of ownTables) {
        let query: any = supabase.from(table).select("*");
        if (table === "profiles") query = query.eq("id", userId);
        else query = query.eq("user_id", userId);
        const { data, error } = await query.limit(5000);
        exportData[table] = error ? { error: error.message } : data ?? [];
      }
      if (conversationIds.length) {
        const [{ data: conversations }, { data: messages }] = await Promise.all([
          supabase.from("conversations").select("*").in("id", conversationIds),
          supabase.from("messages").select("*").in("conversation_id", conversationIds).order("created_at", { ascending: true }).limit(10000),
        ]);
        exportData.conversations = conversations ?? [];
        exportData.messages = messages ?? [];
        const messageIds = (messages ?? []).map((row: any) => String(row.id));
        if (messageIds.length) {
          const { data: reactions } = await supabase.from("message_reactions").select("*").in("message_id", messageIds).limit(10000);
          exportData.message_reactions = reactions ?? [];
        } else exportData.message_reactions = [];
      }
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = href; a.download = `tiger-chat-${username}-export.json`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      setNotice("Account export downloaded.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not export your data."); }
  }

  const percent = campaign && campaign.goal_cents > 0 ? Math.min(100, Math.round((campaign.raised_cents / campaign.goal_cents) * 100)) : 0;

  return <div className="tiger-v11-grid">
    <section className="tiger-card tiger-hero-card">
      <div className={`tiger-profile-glyph tiger-frame-${style?.profile_frame || "none"}`}>{style?.profile_emoji || "🐯"}</div>
      <div>
        <p className="tiger-eyebrow">Your Tiger Chat</p>
        <h2>@{username}</h2>
        <p>{style?.supporter ? `⭐ ${style.supporter_label}` : "Free member"}</p>
      </div>
      <div className="tiger-button-row"><button className="secondary-button" onClick={() => void copyProfile()}>Copy profile link</button><button className="secondary-button" onClick={() => void exportAccount()}>Export my data</button></div>
    </section>

    {style?.supporter && <section className="tiger-card">
      <h3>⭐ Supporter Lounge</h3>
      <p>A private text-only group for supporters and admins.</p>
      <button className="primary-button" onClick={() => void joinLounge()}>Join / open lounge</button>
    </section>}

    <section className="tiger-card">
      <h3>Support Tiger Chat</h3>
      {campaign ? <>
        <strong>{campaign.title}</strong><p>{campaign.description}</p>
        <div className="tiger-progress"><span style={{ width: `${percent}%` }} /></div>
        <small>${(campaign.raised_cents / 100).toFixed(2)} of ${(campaign.goal_cents / 100).toFixed(2)} monthly goal · {percent}%</small>
      </> : <p>No active operating goal.</p>}
      <button className="secondary-button" onClick={() => router.push("/support")}>Open Support Center</button>
    </section>

    <section className="tiger-card tiger-span-2">
      <h3>Achievements</h3>
      {achievements.length === 0 ? <p className="muted-copy">Send messages, create polls, plan events, and explore the app to unlock achievements.</p> : <div className="tiger-chip-list">{achievements.map((item) => <span className="tiger-achievement" key={item.achievement_key}>{item.achievement_catalog?.emoji || "🏆"} <strong>{item.achievement_catalog?.title || item.achievement_key}</strong></span>)}</div>}
    </section>

    <section className="tiger-card tiger-span-2">
      <h3>Optional chat streaks</h3>
      <p className="muted-copy">Streaks are informational only—there are no penalties, reminders, or pressure to keep them.</p>
      {streaks.length === 0 ? <p>No DM streaks yet.</p> : <div className="tiger-stat-row">{streaks.map((streak, index) => <div key={`${streak.user_a}-${streak.user_b}`}><strong>{streak.current_streak} day{streak.current_streak === 1 ? "" : "s"}</strong><small>Best {streak.best_streak} · #{index + 1}</small></div>)}</div>}
    </section>
    {notice && <p className="tiger-notice tiger-span-2">{notice}</p>}
  </div>;
}
