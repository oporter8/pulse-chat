"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { OverviewPanel } from "@/components/v11/OverviewPanel";
import { ProfileStylePanel } from "@/components/v11/ProfileStylePanel";
import { OrganizerPanel } from "@/components/v11/OrganizerPanel";
import { GroupToolsPanel } from "@/components/v11/GroupToolsPanel";
import { SocialPanel } from "@/components/v11/SocialPanel";
import { GamesPanel } from "@/components/v11/GamesPanel";
import { FilesLinksPanel } from "@/components/v11/FilesLinksPanel";
import { AdminSupporterPanel } from "@/components/v11/AdminSupporterPanel";

type Tab = "home" | "profile" | "organize" | "groups" | "social" | "library" | "games" | "admin";

export function CommunityClient() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/login"); return; }
      setUserId(data.user.id);
      const [{ data: profile }, { data: admin }] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", data.user.id).single(),
        supabase.rpc("is_app_admin"),
      ]);
      setUsername(String(profile?.username || "user")); setIsAdmin(Boolean(admin)); setLoading(false);
    })();
  }, [router]);

  if (loading) return <main className="tiger-v11-shell"><div className="tiger-card">Loading Community Center…</div></main>;

  const tabs: [Tab, string][] = [["home","Overview"],["profile","Profile & themes"],["organize","Organize"],["groups","Groups"],["social","Social"],["library","Files & links"],["games","Games & Tiger Bot"]];
  if (isAdmin) tabs.push(["admin","Supporter admin"]);

  return <main className="tiger-v11-shell">
    <header className="tiger-v11-header"><div><p className="tiger-eyebrow">Tiger Chat v11</p><h1>Community Center</h1><p>Text/audio only · no user-generated images or video.</p></div><button className="secondary-button" onClick={() => router.push("/chat")}>Back to chat</button></header>
    <nav className="tiger-v11-tabs" aria-label="Community features">{tabs.map(([key,label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === "home" && <OverviewPanel userId={userId} username={username} />}
    {tab === "profile" && <ProfileStylePanel userId={userId} username={username} />}
    {tab === "organize" && <OrganizerPanel userId={userId} />}
    {tab === "groups" && <GroupToolsPanel userId={userId} />}
    {tab === "social" && <SocialPanel userId={userId} />}
    {tab === "library" && <FilesLinksPanel />}
    {tab === "games" && <GamesPanel />}
    {tab === "admin" && isAdmin && <AdminSupporterPanel userId={userId} />}
  </main>;
}
