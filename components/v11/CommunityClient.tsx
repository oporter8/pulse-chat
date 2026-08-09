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

type Tab = "home" | "profile" | "organize" | "groups" | "social" | "library" | "games";

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
      if (!data.user) { router.replace("/"); return; }
      setUserId(data.user.id);
      const [{ data: profile }, { data: admin }] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", data.user.id).single(),
        supabase.rpc("is_app_admin"),
      ]);
      setUsername(String(profile?.username || "user")); setIsAdmin(Boolean(admin)); setLoading(false);
    })();
  }, [router]);

  if (loading) return <main className="tiger-v12-page"><div className="v12-loading-card">Loading Community Center…</div></main>;

  const tabs: [Tab, string][] = [["home","Overview"],["profile","Profile & themes"],["organize","Organize"],["groups","Groups"],["social","Social"],["library","Files & links"],["games","Games & Tiger Bot"]];

  return <main className="tiger-v12-page community-v12">
    <header className="v12-page-header"><div><p className="v12-kicker">Tiger Chat</p><h1>Community Center</h1><p>Everything beyond the inbox, organized into one clean workspace.</p></div><div className="v12-action-row"><button className="secondary-button" onClick={() => router.push("/chat")}>Back to chat</button>{isAdmin && <button className="primary-button" onClick={() => router.push("/moderation")}>Moderation</button>}</div></header>
    <nav className="v12-scroll-tabs" aria-label="Community features">{tabs.map(([key,label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>
    <div className="v12-community-content">
      {tab === "home" && <OverviewPanel userId={userId} username={username} />}
      {tab === "profile" && <ProfileStylePanel userId={userId} username={username} />}
      {tab === "organize" && <OrganizerPanel userId={userId} />}
      {tab === "groups" && <GroupToolsPanel userId={userId} />}
      {tab === "social" && <SocialPanel userId={userId} />}
      {tab === "library" && <FilesLinksPanel />}
      {tab === "games" && <GamesPanel />}
    </div>
  </main>;
}
