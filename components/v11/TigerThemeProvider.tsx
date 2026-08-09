"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { clearV11ProfileCache, getV11ProfileStyle } from "@/lib/v11-profile";

export function TigerThemeProvider() {
  useEffect(() => {
    let cancelled = false;

    async function apply() {
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) {
        document.documentElement.removeAttribute("data-tiger-accent");
        return;
      }
      const style = await getV11ProfileStyle(data.user.id, true);
      if (cancelled) return;
      const root = document.documentElement;
      root.dataset.tigerAccent = style.accent_color;
      root.dataset.tigerBubble = style.bubble_style;
      root.dataset.tigerDensity = style.chat_density;
      root.dataset.tigerFrame = style.profile_frame;
      root.style.setProperty("--tiger-font-scale", `${style.font_scale / 100}`);
      root.dataset.tigerSupporter = style.supporter ? "true" : "false";
    }

    void apply();
    const handle = () => { clearV11ProfileCache(); void apply(); };
    window.addEventListener("tiger-style-updated", handle);
    const { data: auth } = supabase.auth.onAuthStateChange(() => handle());
    return () => {
      cancelled = true;
      window.removeEventListener("tiger-style-updated", handle);
      auth.subscription.unsubscribe();
    };
  }, []);

  return null;
}
