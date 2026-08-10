"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getV11ProfileStyle } from "@/lib/v11-profile";
import { isFocusActive, type BetaFeatureKey, type FocusSession } from "@/lib/v13-3";

type NavItem = { href: string; icon: string; label: string };

export function TigerNav() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [supporter, setSupporter] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [labsEligible, setLabsEligible] = useState(false);
  const [betaFeatures, setBetaFeatures] = useState<BetaFeatureKey[]>([]);
  const [focus, setFocus] = useState<FocusSession | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    async function syncUser() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setSignedIn(Boolean(data.user));
      if (!data.user) { setSupporter(false); setIsAdmin(false); setLabsEligible(false); setBetaFeatures([]); setFocus(null); return; }
      const [style, adminResult, profileResult, betaResult, focusResult] = await Promise.all([
        getV11ProfileStyle(data.user.id, true),
        supabase.rpc("is_app_admin"),
        supabase.from("profiles").select("staff_role,community_roles").eq("id", data.user.id).single(),
        supabase.from("user_beta_preferences").select("enabled_features").eq("user_id", data.user.id).maybeSingle(),
        supabase.from("focus_sessions").select("user_id,enabled,active_until,mode,allowed_conversation_ids,hide_non_priority,mute_notifications,label,updated_at").eq("user_id", data.user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const roles = (profileResult.data?.community_roles ?? []) as string[];
      setSupporter(Boolean(style.supporter));
      setIsAdmin(Boolean(adminResult.data));
      setLabsEligible(profileResult.data?.staff_role === "owner" || profileResult.data?.staff_role === "admin" || roles.includes("beta_tester"));
      setBetaFeatures((((betaResult.data as any)?.enabled_features ?? []) as BetaFeatureKey[]));
      setFocus((focusResult.data as FocusSession | null) ?? null);
    }
    void syncUser();
    const refresh = () => void syncUser();
    window.addEventListener("tiger-focus-updated", refresh);
    window.addEventListener("tiger-beta-updated", refresh);
    const ticker = window.setInterval(() => setNow(Date.now()), 30_000);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) { setSignedIn(false); setSupporter(false); setIsAdmin(false); setLabsEligible(false); return; }
      setSignedIn(true); void syncUser();
    });
    return () => { cancelled = true; window.clearInterval(ticker); window.removeEventListener("tiger-focus-updated", refresh); window.removeEventListener("tiger-beta-updated", refresh); listener.subscription.unsubscribe(); };
  }, []);

  if (!signedIn || ["/reset-password", "/terms", "/privacy", "/guidelines"].some((path) => pathname?.startsWith(path)) || pathname === "/") return null;

  const links: NavItem[] = [
    { href: "/home", icon: "⌂", label: "Home" },
    { href: "/chat", icon: "◫", label: "Chat" },
    { href: "/community", icon: "◇", label: "Community" },
    { href: "/customize", icon: "✦", label: "Customize" },
    { href: "/support", icon: "☆", label: "Support" },
  ];
  if (labsEligible) links.push({ href: "/labs", icon: "β", label: "Labs" });
  if (isAdmin) links.push({ href: "/moderation", icon: "⌾", label: "Moderation" });

  const focusActive = isFocusActive(focus, now);
  const showFocusChip = focusActive && betaFeatures.includes("focus_nav_status");
  const focusText = (() => {
    if (!showFocusChip) return "";
    if (!focus?.active_until) return "Focus on";
    const minutes = Math.max(1, Math.ceil((new Date(focus.active_until).getTime() - now) / 60000));
    return minutes >= 60 ? `Focus ${Math.floor(minutes / 60)}h` : `Focus ${minutes}m`;
  })();

  return <nav className="tiger-global-nav v12-global-nav v121-nav" aria-label="Tiger Chat navigation">
    <Link href="/home" className="v121-nav-brand" aria-label="Tiger Chat home"><span className="v121-brand-mark" aria-hidden="true">T</span><span className="v121-brand-copy"><strong>Tiger</strong><small>Chat</small></span></Link>
    <div className="v121-nav-links">{links.map((item) => <Link key={item.href} href={item.href} className={pathname?.startsWith(item.href) ? "active" : ""}><span className="v121-nav-icon" aria-hidden="true">{item.icon}</span><span className="v121-nav-label">{item.label}</span></Link>)}</div>
    <div className="v121-nav-footer">{showFocusChip && <Link href="/home" className="v133-nav-focus" title={focus?.label || "Focus Mode"}>◉ <span>{focusText}</span></Link>}{supporter && <span className="v121-supporter-mark" title="Tiger Chat supporter">★</span>}<span className="v121-version">v13.3</span></div>
  </nav>;
}
