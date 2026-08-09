"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getV11ProfileStyle } from "@/lib/v11-profile";
import { VenmoSupportCard } from "@/components/v12/VenmoSupportCard";

type Campaign = { title: string; description: string; goal_cents: number; raised_cents: number };

export default function SupportPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [supporter, setSupporter] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const venmoUrl = process.env.NEXT_PUBLIC_VENMO_PROFILE_URL || process.env.NEXT_PUBLIC_SUPPORT_URL || "";
  const venmoLabel = process.env.NEXT_PUBLIC_VENMO_DISPLAY_NAME || "Venmo";

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

  return <main className="tiger-v12-page support-v12">
    <header className="v12-page-header">
      <div><p className="v12-kicker">Support Center</p><h1>Keep Tiger Chat running</h1><p>Messaging stays free. Support is optional and helps with operating costs.</p></div>
      <Link className="secondary-button" href={signedIn ? "/community" : "/"}>Back</Link>
    </header>

    <section className="v12-support-summary">
      <div><p className="v12-kicker">Current goal</p><h2>{campaign?.title || "Support Tiger Chat"}</h2><p>{campaign?.description || "Help cover hosting, domains, and project operating costs."}</p></div>
      {campaign && <div className="v12-goal-meter"><div className="tiger-progress large"><span style={{ width: `${percent}%` }} /></div><div><strong>${(campaign.raised_cents / 100).toFixed(2)}</strong><span> of ${(campaign.goal_cents / 100).toFixed(2)} goal · {percent}%</span></div></div>}
      {supporter && <div className="v12-supporter-thanks">⭐ You’re marked as a Tiger Chat supporter.</div>}
    </section>

    <VenmoSupportCard url={venmoUrl} label={venmoLabel} />

    <section className="v12-three-cards">
      <article><h3>Free for everyone</h3><p>DMs, groups, search, reactions, polls, events, games, themes, and text/audio messaging stay available without contributing.</p></article>
      <article><h3>Supporter recognition</h3><p>Supporters can receive cosmetic badges, CSS profile frames, the supporter lounge, and other nonessential extras.</p></article>
      <article><h3>Manual verification</h3><p>The QR code does not automatically mark an account as a supporter. An admin verifies a contribution in the Moderation Center first.</p></article>
    </section>
  </main>;
}
