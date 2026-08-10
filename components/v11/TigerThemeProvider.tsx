"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { applyAppearance, normalizeAppearance, type TigerAppearanceMode } from "@/lib/appearance";

const LEGACY_STYLE_IDS = ["tiger-v13-custom-css", "tiger-v13-preview-css"];

function clearLegacyCustomization() {
  for (const id of LEGACY_STYLE_IDS) document.getElementById(id)?.remove();
  const root = document.documentElement;
  delete root.dataset.tigerSafeTheme;
  delete root.dataset.tigerConversationTheme;
  delete root.dataset.tigerBubble;
  delete root.dataset.tigerV131NavPosition;
  delete root.dataset.tigerV131NavStyle;
  delete root.dataset.tigerV131NavLabels;
  delete root.dataset.tigerV131SidebarStyle;
  delete root.dataset.tigerV131MobileNavStyle;
  delete root.dataset.tigerV131MobileHideNav;
  delete root.dataset.tigerV131MobileHeader;
  delete root.dataset.tigerV131MobileComposer;
  delete root.dataset.tigerV131MobileModal;
  delete root.dataset.tigerV132TabletLayout;
  delete root.dataset.tigerV132TabletNav;
}

function localMode(): TigerAppearanceMode {
  try { return normalizeAppearance(window.localStorage.getItem("tiger-appearance")); }
  catch { return "bright"; }
}

export function TigerThemeProvider() {
  useEffect(() => {
    let cancelled = false;

    async function sync() {
      clearLegacyCustomization();
      applyAppearance(localMode());
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;

      const { data: row, error } = await supabase
        .from("user_appearance_settings")
        .select("mode")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (cancelled || error || !row) return;
      applyAppearance(normalizeAppearance(row.mode));
    }

    const refresh = () => void sync();
    void sync();
    window.addEventListener("tiger-appearance-updated", refresh);
    const { data: listener } = supabase.auth.onAuthStateChange(() => refresh());

    return () => {
      cancelled = true;
      window.removeEventListener("tiger-appearance-updated", refresh);
      listener.subscription.unsubscribe();
    };
  }, []);

  return null;
}
