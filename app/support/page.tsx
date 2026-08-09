"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getV11ProfileStyle } from "@/lib/v11-profile";

type Campaign = { title: string; description: string; goal_cents: number; raised_cents: number };

export default function SupportPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [supporter, setSupporter] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const supportUrl = process.env.NEXT_PUBLIC_SUPPORT_URL || "";

  useEffect(() => {
    void (async () => {
      const [{ data: campaignData }, { data: auth }] = await Promise.all([
        supabase.from("support_campaigns").select("title,description,goal_cents,raised_cents").eq("active", true).limit(1).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      setCampaign((campaignData ?? null) as Campaign | null);
      setSignedIn(Boolean(auth.user));
      if (auth.user) setSupporter((await getV11ProfileStyle(auth.user.id, true)).supporter);
    })();
  }, []);

  const percent = campaign && campaign.goal_cents > 0 ? Math.min(100, Math.round((campaign.raised_cents / campaign.goal_cents) * 100)) : 0;
  return <main className="tiger-v11-shell tiger-support-page">
    <header className="tiger-v11-header"><div><p className="tiger-eyebrow">Optional support</p><h1>Keep Tiger Chat operating 🐯</h1><p>Tiger Chat messaging stays free. Support is voluntary and never required to send messages.</p></div><Link className="secondary-button" href={signedIn ? "/community" : "/"}>Back</Link></header>

    <section className="tiger-card tiger-support-hero">
      <h2>{campaign?.title || "Support Tiger Chat"}</h2><p>{campaign?.description || "Help cover hosting, domains, and operating costs."}</p>
      {campaign && <><div className="tiger-progress large"><span style={{ width: `${percent}%` }} /></div><strong>${(campaign.raised_cents / 100).toFixed(2)} raised of ${(campaign.goal_cents / 100).toFixed(2)} goal</strong></>}
      {supportUrl ? <a className="primary-button" href={supportUrl} target="_blank" rel="noreferrer">Open support link</a> : <div className="tiger-notice">No online contribution link is configured yet. An admin can add a compliant support option later with <code>NEXT_PUBLIC_SUPPORT_URL</code>.</div>}
      {supporter && <div className="tiger-supporter-thanks">⭐ You’re marked as a Tiger Chat supporter. Thank you.</div>}
    </section>

    <section className="tiger-v11-grid">
      <article className="tiger-card"><h3>Everyone gets</h3><p>Full DMs and groups, search, reactions, polls, events, games, Tiger Bot, saved messages, themes, notes, and text/audio features.</p></article>
      <article className="tiger-card"><h3>Supporter extras</h3><p>Supporter badge, seasonal CSS frames, larger quick-reaction tray, Supporter Lounge, and early-access cosmetics.</p></article>
      <article className="tiger-card tiger-span-2"><h3>No paywall</h3><p>Donating does not unlock the basic messaging service. Supporter perks are optional extras, and the app remains usable without donating.</p></article>
    </section>
  </main>;
}
