"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { BETA_FEATURES, type BetaFeatureKey } from "@/lib/v13-3";

export function BetaLabs() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [eligible, setEligible] = useState(false);
  const [enabled, setEnabled] = useState<BetaFeatureKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/"); return; }
      const [{ data: profile }, { data: preference }] = await Promise.all([
        supabase.from("profiles").select("staff_role,community_roles").eq("id", data.user.id).single(),
        supabase.from("user_beta_preferences").select("enabled_features").eq("user_id", data.user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const roles = (profile?.community_roles ?? []) as string[];
      const canUse = profile?.staff_role === "owner" || profile?.staff_role === "admin" || roles.includes("beta_tester");
      setUserId(data.user.id); setEligible(canUse); setEnabled(((preference as any)?.enabled_features ?? []) as BetaFeatureKey[]); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  async function toggle(key: BetaFeatureKey) {
    if (!eligible || !userId) return;
    const next = enabled.includes(key) ? enabled.filter((item) => item !== key) : [...enabled, key];
    const { error } = await supabase.from("user_beta_preferences").upsert({ user_id: userId, enabled_features: next, updated_at: new Date().toISOString() });
    if (error) { setMessage(error.message); return; }
    setEnabled(next); window.dispatchEvent(new CustomEvent("tiger-beta-updated")); setMessage("Beta preference saved.");
  }

  if (loading) return <main className="tiger-v12-page"><div className="v12-loading-card">Loading Beta Labs…</div></main>;
  if (!eligible) return <main className="tiger-v12-page"><header className="v12-page-header"><div><p className="v12-kicker">Tiger Chat Beta</p><h1>Beta Labs</h1><p>This area is available to Beta Testers and authorized staff.</p></div></header><section className="tiger-card"><h2>Beta access required</h2><p className="muted-copy">An Owner can grant the β Beta Tester community role from Moderation → Roles.</p><button className="primary-button" onClick={() => router.push("/home")}>Back Home</button></section></main>;

  return <main className="tiger-v12-page v133-labs-page">
    <header className="v12-page-header"><div><p className="v12-kicker">β Beta Tester</p><h1>Beta Labs</h1><p>Working experiments you can opt into individually. Turn any of them off instantly if you prefer the standard experience.</p></div><button className="secondary-button" onClick={() => router.push("/home")}>Back Home</button></header>
    <div className="v133-labs-grid">{BETA_FEATURES.map((feature) => <section className={`tiger-card v133-lab-card ${enabled.includes(feature.key) ? "enabled" : ""}`} key={feature.key}><div><span className="v133-lab-icon">β</span><span className={`v133-state-pill ${enabled.includes(feature.key) ? "active" : ""}`}>{enabled.includes(feature.key) ? "ON" : "OFF"}</span></div><h2>{feature.title}</h2><p>{feature.description}</p><button className={enabled.includes(feature.key) ? "secondary-button" : "primary-button"} onClick={() => void toggle(feature.key)}>{enabled.includes(feature.key) ? "Disable experiment" : "Enable experiment"}</button></section>)}</div>
    {message && <button className="notice-toast-v8" onClick={() => setMessage("")}>{message} ×</button>}
  </main>;
}
