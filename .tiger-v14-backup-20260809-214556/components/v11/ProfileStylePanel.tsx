"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clearV11ProfileCache, getV11ProfileStyle, type V11ProfileStyle } from "@/lib/v11-profile";

const ACCENTS = ["tiger","orange","gold","blue","purple","green","mono","sunset"];
const FRAMES = ["none","supporter","championship","winter","spring","night"];
const BUBBLES = ["rounded","compact","square","soft"];

export function ProfileStylePanel({ userId, username }: { userId: string; username: string }) {
  const [style, setStyle] = useState<V11ProfileStyle | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { void getV11ProfileStyle(userId, true).then(setStyle); }, [userId]);
  if (!style) return <div className="tiger-card">Loading profile tools…</div>;

  function patch<K extends keyof V11ProfileStyle>(key: K, value: V11ProfileStyle[K]) {
    setStyle((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    const currentStyle = style;
    if (!currentStyle) return;

    setSaving(true); setMessage("");
    const reactions = currentStyle.custom_reactions.map((x) => x.trim()).filter(Boolean).slice(0, currentStyle.supporter ? 8 : 5);
    const { error } = await supabase.from("profiles").update({
      profile_emoji: currentStyle.profile_emoji,
      favorite_song: currentStyle.favorite_song,
      social_link: currentStyle.social_link,
      accent_color: currentStyle.accent_color,
      profile_frame: currentStyle.supporter ? currentStyle.profile_frame : "none",
      bubble_style: currentStyle.bubble_style,
      chat_density: currentStyle.chat_density,
      font_scale: currentStyle.font_scale,
      custom_reactions: reactions,
      dnd_until: currentStyle.dnd_until,
      extras_visibility: currentStyle.extras_visibility,
    }).eq("id", userId);
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    clearV11ProfileCache(userId);
    window.dispatchEvent(new Event("tiger-style-updated"));
    setMessage("Profile and appearance saved.");
  }

  function setDnd(hours: number | null) {
    patch("dnd_until", hours === null ? null : new Date(Date.now() + hours * 60 * 60 * 1000).toISOString());
  }

  return <div className="tiger-v11-grid">
    <section className="tiger-card tiger-span-2">
      <p className="tiger-eyebrow">Text-only profile</p>
      <div className="tiger-profile-preview" data-accent={style.accent_color}>
        <div className={`tiger-profile-glyph tiger-frame-${style.profile_frame}`}>{style.profile_emoji}</div>
        <div><h2>@{username}</h2>{style.supporter && <span className="tiger-supporter-badge">⭐ {style.supporter_label}</span>}<p>{style.favorite_song || "Add a favorite song/title"}</p></div>
      </div>
      <p className="muted-copy">Tiger Chat v11 does not allow profile photos, image banners, GIFs, or video.</p>
    </section>

    <section className="tiger-card">
      <h3>Profile extras</h3>
      <label>Profile emoji<input value={style.profile_emoji} maxLength={16} onChange={(e) => patch("profile_emoji", e.target.value)} /></label>
      <label>Favorite song / track<input value={style.favorite_song} maxLength={80} onChange={(e) => patch("favorite_song", e.target.value)} placeholder="Song — Artist" /></label>
      <label>Social / website link<input value={style.social_link} maxLength={160} onChange={(e) => patch("social_link", e.target.value)} placeholder="https://…" /></label>
      <label>Who can see extras<select value={style.extras_visibility} onChange={(e) => patch("extras_visibility", e.target.value as V11ProfileStyle["extras_visibility"])}><option value="everyone">Everyone</option><option value="close_friends">Close friends</option><option value="nobody">Nobody</option></select></label>
    </section>

    <section className="tiger-card">
      <h3>Theme creator</h3>
      <label>Accent<select value={style.accent_color} onChange={(e) => patch("accent_color", e.target.value)}>{ACCENTS.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label>Message bubbles<select value={style.bubble_style} onChange={(e) => patch("bubble_style", e.target.value)}>{BUBBLES.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label>Chat spacing<select value={style.chat_density} onChange={(e) => patch("chat_density", e.target.value)}><option value="compact">Compact</option><option value="comfortable">Comfortable</option><option value="spacious">Spacious</option></select></label>
      <label>Text size <strong>{style.font_scale}%</strong><input type="range" min="85" max="125" step="5" value={style.font_scale} onChange={(e) => patch("font_scale", Number(e.target.value))} /></label>
    </section>

    <section className="tiger-card">
      <h3>Reaction tray</h3>
      <p>{style.supporter ? "Supporters can save up to 8 quick reactions." : "Free accounts can save 5 quick reactions."}</p>
      <input value={style.custom_reactions.join(" ")} onChange={(e) => patch("custom_reactions", e.target.value.split(/\s+/).filter(Boolean))} placeholder="👍 ❤️ 😂 🔥 😮" />
      <small>Separate reactions with spaces.</small>
    </section>

    <section className="tiger-card">
      <h3>Do Not Disturb</h3>
      <p>{style.dnd_until && new Date(style.dnd_until) > new Date() ? `On until ${new Date(style.dnd_until).toLocaleString()}` : "Off"}</p>
      <div className="tiger-button-row"><button className="secondary-button" onClick={() => setDnd(1)}>1 hour</button><button className="secondary-button" onClick={() => setDnd(8)}>8 hours</button><button className="secondary-button" onClick={() => setDnd(24)}>24 hours</button><button className="secondary-button" onClick={() => setDnd(null)}>Off</button></div>
    </section>

    <section className="tiger-card tiger-span-2">
      <h3>Supporter cosmetics</h3>
      {style.supporter ? <label>Profile frame<select value={style.profile_frame} onChange={(e) => patch("profile_frame", e.target.value)}>{FRAMES.map((x) => <option key={x}>{x}</option>)}</select></label> : <p className="muted-copy">Supporters unlock text/CSS profile frames and seasonal cosmetics. No image assets are used.</p>}
      <button className="primary-button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save customization"}</button>
      {message && <p className="tiger-notice">{message}</p>}
    </section>
  </div>;
}
