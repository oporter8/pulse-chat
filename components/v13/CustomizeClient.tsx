"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ThemeStudio } from "@/components/v13/ThemeStudio";

export function CustomizeClient() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { void (async () => { const { data } = await supabase.auth.getUser(); if (!data.user) { router.replace("/"); return; } setUserId(data.user.id); setLoading(false); })(); }, [router]);
  if (loading) return <main className="tiger-v12-page"><div className="v12-loading-card">Loading Theme Studio…</div></main>;
  return <main className="tiger-v12-page v13-customize-page"><header className="v12-page-header"><div><p className="v12-kicker">Tiger Chat v13</p><h1>Theme Studio</h1><p>Build, save, import, export and sync your own Tiger Chat appearance.</p></div><button className="secondary-button" onClick={() => router.push("/chat")}>Back to chat</button></header><ThemeStudio userId={userId} /></main>;
}
