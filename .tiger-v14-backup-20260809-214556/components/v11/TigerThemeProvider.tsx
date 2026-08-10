"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getV11ProfileStyle } from "@/lib/v11-profile";
import { applyTigerThemeToDocument, DEFAULT_TIGER_THEME, normalizeTigerThemeConfig, type TigerSavedTheme } from "@/lib/v13-theme";

const STYLE_ID = "tiger-v13-custom-css";

function customStyleElement() {
  let element = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!element) {
    element = document.createElement("style");
    element.id = STYLE_ID;
    document.head.appendChild(element);
  }
  return element;
}

function clearCustomCss() {
  const element = document.getElementById(STYLE_ID);
  if (element) element.textContent = "";
}

export function TigerThemeProvider() {
  useEffect(() => {
    let cancelled = false;
    let legalGateOpen = false;

    function safeModeRequested() {
      const params = new URLSearchParams(window.location.search);
      if (params.get("safeTheme") === "1") window.sessionStorage.setItem("tiger-safe-theme", "1");
      return window.sessionStorage.getItem("tiger-safe-theme") === "1";
    }

    async function apply() {
      const safeMode = safeModeRequested();
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!data.user) {
        applyTigerThemeToDocument(DEFAULT_TIGER_THEME);
        clearCustomCss();
        return;
      }

      let active: TigerSavedTheme | null = null;
      const { data: themeRow, error } = await supabase
        .from("user_themes")
        .select("id,user_id,name,preset,config,custom_css,is_active,created_at,updated_at")
        .eq("user_id", data.user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!error && themeRow) active = themeRow as TigerSavedTheme;

      if (active && !safeMode) {
        applyTigerThemeToDocument(normalizeTigerThemeConfig(active.config));
        customStyleElement().textContent = legalGateOpen ? "" : active.custom_css || "";
      } else {
        const legacy = await getV11ProfileStyle(data.user.id, true).catch(() => null);
        const fallback = normalizeTigerThemeConfig({
          ...DEFAULT_TIGER_THEME,
          accent: legacy?.accent_color === "blue" ? "#4f8cff" : legacy?.accent_color === "purple" ? "#a78bfa" : legacy?.accent_color === "green" ? "#4ade80" : legacy?.accent_color === "gold" ? "#eab308" : DEFAULT_TIGER_THEME.accent,
          fontScale: legacy?.font_scale ?? 100,
          density: legacy?.chat_density ?? "comfortable",
        });
        applyTigerThemeToDocument(safeMode ? DEFAULT_TIGER_THEME : fallback);
        clearCustomCss();
      }
      document.documentElement.dataset.tigerSafeTheme = safeMode ? "true" : "false";
    }

    function refresh() { void apply(); }
    function onLegalGate(event: Event) {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      legalGateOpen = Boolean(detail?.open);
      if (legalGateOpen) clearCustomCss();
      else void apply();
    }
    function recoveryShortcut(event: KeyboardEvent) {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        window.sessionStorage.setItem("tiger-safe-theme", "1");
        applyTigerThemeToDocument(DEFAULT_TIGER_THEME);
        clearCustomCss();
        document.documentElement.dataset.tigerSafeTheme = "true";
      }
    }

    void apply();
    window.addEventListener("tiger-theme-updated", refresh);
    window.addEventListener("tiger-style-updated", refresh);
    window.addEventListener("tiger-legal-gate", onLegalGate as EventListener);
    window.addEventListener("keydown", recoveryShortcut);
    const { data: auth } = supabase.auth.onAuthStateChange(() => refresh());

    return () => {
      cancelled = true;
      window.removeEventListener("tiger-theme-updated", refresh);
      window.removeEventListener("tiger-style-updated", refresh);
      window.removeEventListener("tiger-legal-gate", onLegalGate as EventListener);
      window.removeEventListener("keydown", recoveryShortcut);
      auth.subscription.unsubscribe();
    };
  }, []);

  return null;
}
