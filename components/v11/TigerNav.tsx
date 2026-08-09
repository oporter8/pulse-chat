"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getV11ProfileStyle } from "@/lib/v11-profile";

type NavItem = { href: string; icon: string; label: string };

export function TigerNav() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [supporter, setSupporter] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function syncUser() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setSignedIn(Boolean(data.user));
      if (!data.user) {
        setSupporter(false);
        setIsAdmin(false);
        return;
      }

      const [style, adminResult] = await Promise.all([
        getV11ProfileStyle(data.user.id, true),
        supabase.rpc("is_app_admin"),
      ]);
      if (cancelled) return;
      setSupporter(Boolean(style.supporter));
      setIsAdmin(Boolean(adminResult.data));
    }

    void syncUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setSignedIn(false);
        setSupporter(false);
        setIsAdmin(false);
        return;
      }
      setSignedIn(true);
      void Promise.all([
        getV11ProfileStyle(session.user.id, true),
        supabase.rpc("is_app_admin"),
      ]).then(([style, adminResult]) => {
        if (cancelled) return;
        setSupporter(Boolean(style.supporter));
        setIsAdmin(Boolean(adminResult.data));
      });
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!signedIn || ["/login", "/forgot-password", "/reset-password"].some((path) => pathname?.startsWith(path))) {
    return null;
  }

  const links: NavItem[] = [
    { href: "/chat", icon: "◫", label: "Chat" },
    { href: "/community", icon: "◇", label: "Community" },
    { href: "/support", icon: "☆", label: "Support" },
  ];
  if (isAdmin) links.push({ href: "/moderation", icon: "⌾", label: "Moderation" });

  return (
    <nav className="tiger-global-nav v12-global-nav v121-nav" aria-label="Tiger Chat navigation">
      <Link href="/chat" className="v121-nav-brand" aria-label="Tiger Chat home">
        <span className="v121-brand-mark" aria-hidden="true">T</span>
        <span className="v121-brand-copy"><strong>Tiger</strong><small>Chat</small></span>
      </Link>

      <div className="v121-nav-links">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className={pathname?.startsWith(item.href) ? "active" : ""}>
            <span className="v121-nav-icon" aria-hidden="true">{item.icon}</span>
            <span className="v121-nav-label">{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="v121-nav-footer">
        {supporter && <span className="v121-supporter-mark" title="Tiger Chat supporter">★</span>}
        <span className="v121-version">v12</span>
      </div>
    </nav>
  );
}
