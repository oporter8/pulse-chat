"use client";

import { supabase } from "@/lib/supabase";

export type V11ProfileStyle = {
  id: string;
  supporter: boolean;
  supporter_since: string | null;
  supporter_label: string;
  profile_emoji: string;
  favorite_song: string;
  social_link: string;
  accent_color: string;
  profile_frame: string;
  bubble_style: string;
  chat_density: string;
  font_scale: number;
  custom_reactions: string[];
  dnd_until: string | null;
  extras_visibility: "everyone" | "close_friends" | "nobody";
};

const cache = new Map<string, { value: V11ProfileStyle; at: number }>();
const TTL = 60_000;

const fallback = (id: string): V11ProfileStyle => ({
  id,
  supporter: false,
  supporter_since: null,
  supporter_label: "SUPPORTER",
  profile_emoji: "🐯",
  favorite_song: "",
  social_link: "",
  accent_color: "tiger",
  profile_frame: "none",
  bubble_style: "rounded",
  chat_density: "comfortable",
  font_scale: 100,
  custom_reactions: ["👍", "❤️", "😂", "🔥", "😮"],
  dnd_until: null,
  extras_visibility: "everyone",
});

export async function getV11ProfileStyle(userId: string, force = false): Promise<V11ProfileStyle> {
  const existing = cache.get(userId);
  if (!force && existing && Date.now() - existing.at < TTL) return existing.value;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,supporter,supporter_since,supporter_label,profile_emoji,favorite_song,social_link,accent_color,profile_frame,bubble_style,chat_density,font_scale,custom_reactions,dnd_until,extras_visibility")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return fallback(userId);
  const value: V11ProfileStyle = {
    id: String(data.id),
    supporter: Boolean(data.supporter),
    supporter_since: typeof data.supporter_since === "string" ? data.supporter_since : null,
    supporter_label: String(data.supporter_label || "SUPPORTER"),
    profile_emoji: String(data.profile_emoji || "🐯"),
    favorite_song: String(data.favorite_song || ""),
    social_link: String(data.social_link || ""),
    accent_color: String(data.accent_color || "tiger"),
    profile_frame: String(data.profile_frame || "none"),
    bubble_style: String(data.bubble_style || "rounded"),
    chat_density: String(data.chat_density || "comfortable"),
    font_scale: Number(data.font_scale || 100),
    custom_reactions: Array.isArray(data.custom_reactions) ? data.custom_reactions.map(String).slice(0, 8) : fallback(userId).custom_reactions,
    dnd_until: typeof data.dnd_until === "string" ? data.dnd_until : null,
    extras_visibility: data.extras_visibility === "close_friends" || data.extras_visibility === "nobody" ? data.extras_visibility : "everyone",
  };
  cache.set(userId, { value, at: Date.now() });
  return value;
}

export function clearV11ProfileCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
