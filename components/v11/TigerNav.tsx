"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getV11ProfileStyle } from "@/lib/v11-profile";

export function TigerNav() {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [supporter, setSupporter] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      setSignedIn(Boolean(data.user));
      if (data.user) {
        const style = await getV11ProfileStyle(data.user.id);
        if (!cancelled) setSupporter(style.supporter);
      }
    }
    void load();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user));
      if (!session?.user) setSupporter(false);
      else void getV11ProfileStyle(session.user.id, true).then((style) => setSupporter(style.supporter));
    });
    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, []);

  if (!signedIn || ["/login", "/forgot-password", "/reset-password"].some((path) => pathname?.startsWith(path))) return null;

  const links = [
    ["/chat", "💬", "Chat"],
    ["/community", "🐯", "Community"],
    ["/support", "⭐", "Support"],
  ] as const;

  return (
    <nav className="tiger-global-nav" aria-label="Tiger Chat navigation">
      {links.map(([href, icon, label]) => (
        <Link key={href} href={href} className={pathname?.startsWith(href) ? "active" : ""}>
          <span aria-hidden="true">{icon}</span><span>{label}</span>
        </Link>
      ))}
      {supporter && <span className="tiger-nav-supporter" title="Tiger Chat supporter">⭐</span>}
    </nav>
  );
}
