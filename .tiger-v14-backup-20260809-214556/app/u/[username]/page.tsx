"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type PublicProfile = { id: string; username: string; display_name: string; bio: string; status_text: string; supporter: boolean; supporter_label: string; profile_emoji: string; favorite_song: string; social_link: string; accent_color: string; profile_frame: string; extras_visibility: string; created_at: string };

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(String(params.username || "")).toLowerCase();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [canExtras, setCanExtras] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("profiles").select("id,username,display_name,bio,status_text,supporter,supporter_label,profile_emoji,favorite_song,social_link,accent_color,profile_frame,extras_visibility,created_at").eq("username", username).maybeSingle();
      if (!data) { setLoading(false); return; }
      const row = data as PublicProfile; setProfile(row);
      const { data: allowed } = await supabase.rpc("can_view_profile_extras_v11", { target_user: row.id });
      setCanExtras(Boolean(allowed)); setLoading(false);
    })();
  }, [username]);

  if (loading) return <main className="tiger-v11-shell"><div className="tiger-card">Loading profile…</div></main>;
  if (!profile) return <main className="tiger-v11-shell"><div className="tiger-card"><h1>Profile not found</h1><Link href="/chat">Back to Tiger Chat</Link></div></main>;

  return <main className="tiger-v11-shell"><section className="tiger-card tiger-public-profile" data-accent={profile.accent_color}>
    <div className={`tiger-profile-glyph tiger-frame-${profile.profile_frame}`}>{profile.profile_emoji || "🐯"}</div>
    <p className="tiger-eyebrow">Tiger Chat profile</p><h1>{profile.display_name}</h1><strong>@{profile.username}</strong>
    {profile.supporter && <span className="tiger-supporter-badge">⭐ {profile.supporter_label}</span>}
    {profile.status_text && <p className="tiger-profile-status">{profile.status_text}</p>}
    {profile.bio && <p>{profile.bio}</p>}
    {canExtras && <div className="tiger-profile-extras">{profile.favorite_song && <p>🎵 {profile.favorite_song}</p>}{profile.social_link && <p>🔗 <a href={profile.social_link} target="_blank" rel="noreferrer">{profile.social_link}</a></p>}</div>}
    <small>Member since {new Date(profile.created_at).toLocaleDateString()}</small>
    <div className="tiger-button-row"><Link className="primary-button" href="/chat">Open Tiger Chat</Link><Link className="secondary-button" href="/community">Community Center</Link></div>
  </section></main>;
}
