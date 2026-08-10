"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clearV11ProfileCache, getV11ProfileStyle, type V11ProfileStyle } from "@/lib/v11-profile";

export function ProfileStylePanel({ userId, username }: { userId: string; username: string }) {
  const [style, setStyle] = useState<V11ProfileStyle | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { void getV11ProfileStyle(userId, true).then(setStyle); }, [userId]);
  if (!style) return <div className="tiger-card">Loading profile…</div>;

  function patch<K extends keyof V11ProfileStyle>(key: K, value: V11ProfileStyle[K]) {
    setStyle((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    const current = style;
    if (!current) return;
    setSaving(true); setMessage("");
    const reactions = current.custom_reactions.map((x) => x.trim()).filter(Boolean).slice(0, current.supporter ? 8 : 5);
    const { error } = await supabase.from("profiles").update({
      profile_emoji: current.profile_emoji,
      favorite_song: current.favorite_song,
      social_link: current.social_link,
      custom_reactions: reactions,
      dnd_until: current.dnd_until,
      extras_visibility: current.extras_visibility,
    }).eq("id", userId);
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    clearV11ProfileCache(userId);
    window.dispatchEvent(new Event("tiger-style-updated"));
    setMessage("Profile saved.");
  }

  function setDnd(hours: number | null) {
    patch("dnd_until", hours === null ? null : new Date(Date.now() + hours * 60 * 60 * 1000).toISOString());
  }

  return <div className="tiger-v11-grid pro-profile-grid">
    <section className="tiger-card tiger-span-2 pro-profile-summary">
      <div className="tiger-profile-preview"><div className="tiger-profile-glyph">{style.profile_emoji}</div><div><p className="tiger-eyebrow">Profile</p><h2>@{username}</h2>{style.supporter && <span className="tiger-supporter-badge">Supporter</span>}<p>{style.favorite_song || "Add a favorite song or short profile detail."}</p></div></div>
    </section>

    <section className="tiger-card">
      <h3>Profile details</h3>
      <label>Profile emoji<input value={style.profile_emoji} maxLength={16} onChange={(e) => patch("profile_emoji", e.target.value)} /></label>
      <label>Favorite song / track<input value={style.favorite_song} maxLength={80} onChange={(e) => patch("favorite_song", e.target.value)} placeholder="Song — Artist" /></label>
      <label>Social / website link<input value={style.social_link} maxLength={160} onChange={(e) => patch("social_link", e.target.value)} placeholder="https://…" /></label>
      <label>Who can see extras<select value={style.extras_visibility} onChange={(e) => patch("extras_visibility", e.target.value as V11ProfileStyle["extras_visibility"])}><option value="everyone">Everyone</option><option value="close_friends">Close friends</option><option value="nobody">Nobody</option></select></label>
    </section>

    <section className="tiger-card">
      <h3>Quick reactions</h3>
      <p className="muted-copy">Choose the reactions you use most often.</p>
      <input value={style.custom_reactions.join(" ")} onChange={(e) => patch("custom_reactions", e.target.value.split(/\s+/).filter(Boolean))} placeholder="👍 ❤️ 😂 🔥 😮" />
      <small>{style.supporter ? "Up to 8 reactions." : "Up to 5 reactions."}</small>
    </section>

    <section className="tiger-card tiger-span-2">
      <div className="pro-setting-line"><div><h3>Do Not Disturb</h3><p className="muted-copy">Temporarily quiet Tiger Chat without changing your appearance.</p></div><strong>{style.dnd_until && new Date(style.dnd_until) > new Date() ? `Until ${new Date(style.dnd_until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Off"}</strong></div>
      <div className="tiger-button-row"><button className="secondary-button" onClick={() => setDnd(1)}>1 hour</button><button className="secondary-button" onClick={() => setDnd(8)}>8 hours</button><button className="secondary-button" onClick={() => setDnd(24)}>24 hours</button><button className="secondary-button" onClick={() => setDnd(null)}>Turn off</button></div>
      <div className="pro-save-row"><button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save profile"}</button>{message && <span className="muted-copy">{message}</span>}</div>
    </section>
  </div>;
}
