"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { applyAppearance, normalizeAppearance, TIGER_APPEARANCES, type TigerAppearanceMode } from "@/lib/appearance";
import { TigerIcon } from "@/components/ui/TigerIcon";

export function AppearanceClient() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [mode, setMode] = useState<TigerAppearanceMode>("bright");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/"); return; }
      let local: TigerAppearanceMode = "bright";
      try { local = normalizeAppearance(window.localStorage.getItem("tiger-appearance")); } catch { /* noop */ }
      const { data: row } = await supabase.from("user_appearance_settings").select("mode").eq("user_id", data.user.id).maybeSingle();
      if (cancelled) return;
      const next = normalizeAppearance(row?.mode ?? local);
      setUserId(data.user.id); setMode(next); applyAppearance(next); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function choose(next: TigerAppearanceMode) {
    if (!userId || saving) return;
    setMode(next); applyAppearance(next); setSaving(true); setMessage("");
    const { error } = await supabase.from("user_appearance_settings").upsert({ user_id: userId, mode: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSaving(false);
    if (error) { setMessage("Saved on this device. Run the v14 migration to sync appearance across devices."); return; }
    window.dispatchEvent(new Event("tiger-appearance-updated"));
    setMessage("Appearance saved.");
  }

  if (loading) return <main className="tiger-v12-page"><div className="v12-loading-card">Loading appearance…</div></main>;

  return <main className="tiger-v12-page pro-appearance-page">
    <header className="v12-page-header pro-page-heading">
      <div className="pro-heading-copy"><span className="pro-section-icon"><TigerIcon name="appearance" /></span><div><p className="v12-kicker">Appearance</p><h1>Choose your look</h1><p>Tiger Chat uses three carefully designed modes. Appearance is intentionally simple and consistent across Tiger Chat.</p></div></div>
      <button className="secondary-button" onClick={() => router.push("/home")}>Back Home</button>
    </header>

    <section className="pro-appearance-list" aria-label="Appearance choices">
      {TIGER_APPEARANCES.map((option) => <button key={option.id} type="button" className={`pro-appearance-option ${mode === option.id ? "active" : ""}`} onClick={() => void choose(option.id)} disabled={saving}>
        <span className={`pro-appearance-swatch mode-${option.id}`} aria-hidden="true"><i/><i/><i/></span>
        <span className="pro-appearance-copy"><strong>{option.name}</strong><small>{option.description}</small></span>
        <span className="pro-radio" aria-hidden="true">{mode === option.id ? "✓" : ""}</span>
      </button>)}
    </section>

    <p className="pro-appearance-note">Appearance is visual only. Messages, Focus Mode, school schedule, roles, and all other Tiger Chat features work the same in every mode.</p>
    {message && <button className="notice-toast-v8" onClick={() => setMessage("")}>{message} ×</button>}
  </main>;
}
