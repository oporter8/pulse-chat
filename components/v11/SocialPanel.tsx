"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Friend = { id: string; username: string; display_name: string; profile_emoji?: string | null };
type Story = { id: string; user_id: string; body: string; emoji: string; audience: string; created_at: string; expires_at: string; profile?: { username?: string; display_name?: string } | null };

export function SocialPanel({ userId }: { userId: string }) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [results, setResults] = useState<Friend[]>([]);
  const [query, setQuery] = useState("");
  const [stories, setStories] = useState<Story[]>([]);
  const [body, setBody] = useState("");
  const [emoji, setEmoji] = useState("🐯");
  const [audience, setAudience] = useState("everyone");
  const [message, setMessage] = useState("");

  async function load() {
    const [{ data: friendRows }, { data: storyRows }] = await Promise.all([
      supabase.from("close_friends").select("friend_id").eq("user_id", userId),
      supabase.from("text_stories").select("id,user_id,body,emoji,audience,created_at,expires_at,profile:profiles!text_stories_user_id_fkey(username,display_name)").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(100),
    ]);
    const ids = (friendRows ?? []).map((row: any) => String(row.friend_id));
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("id,username,display_name,profile_emoji").in("id", ids);
      setFriends((data ?? []) as Friend[]);
    } else setFriends([]);
    setStories((storyRows ?? []) as unknown as Story[]);
  }
  useEffect(() => { void load(); }, [userId]);

  async function search() {
    const clean = query.trim();
    if (!clean) { setResults([]); return; }
    const { data } = await supabase.from("profiles").select("id,username,display_name,profile_emoji").neq("id", userId).or(`username.ilike.%${clean.replaceAll(",", "")}%,display_name.ilike.%${clean.replaceAll(",", "")}%`).limit(12);
    setResults((data ?? []) as Friend[]);
  }
  async function addFriend(id: string) {
    const { error } = await supabase.from("close_friends").upsert({ user_id: userId, friend_id: id }, { onConflict: "user_id,friend_id" });
    setMessage(error ? error.message : "Added to Close Friends."); if (!error) await load();
  }
  async function removeFriend(id: string) { await supabase.from("close_friends").delete().eq("user_id", userId).eq("friend_id", id); await load(); }
  async function postStory() {
    if (!body.trim()) return;
    const { error } = await supabase.from("text_stories").insert({ user_id: userId, body: body.trim(), emoji: emoji || "🐯", audience });
    setMessage(error ? error.message : "24-hour text note posted."); if (!error) { setBody(""); await load(); }
  }
  async function deleteStory(id: string) { await supabase.from("text_stories").delete().eq("id", id).eq("user_id", userId); await load(); }

  return <div className="tiger-v11-grid">
    <section className="tiger-card">
      <h3>Close Friends</h3>
      <div className="tiger-inline-form"><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void search(); }} placeholder="Search username" /><button className="secondary-button" onClick={() => void search()}>Search</button></div>
      <div className="tiger-list">{results.map((profile) => <div className="tiger-list-row" key={profile.id}><span><strong>{profile.profile_emoji || "🐯"} {profile.display_name}</strong><small>@{profile.username}</small></span><button className="secondary-button" onClick={() => void addFriend(profile.id)}>Add</button></div>)}</div>
      <h4>Your list</h4>
      {friends.length === 0 ? <p className="muted-copy">No Close Friends yet.</p> : friends.map((profile) => <div className="tiger-list-row" key={profile.id}><span><strong>{profile.profile_emoji || "🐯"} {profile.display_name}</strong><small>@{profile.username}</small></span><button className="secondary-button" onClick={() => void removeFriend(profile.id)}>Remove</button></div>)}
    </section>

    <section className="tiger-card">
      <h3>24-hour text status</h3>
      <p className="muted-copy">Stories/notes are text + emoji only. No photo or video stories.</p>
      <label>Emoji<input value={emoji} maxLength={16} onChange={(e) => setEmoji(e.target.value)} /></label>
      <label>Note<textarea rows={4} maxLength={280} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What’s happening?" /></label>
      <label>Audience<select value={audience} onChange={(e) => setAudience(e.target.value)}><option value="everyone">Everyone</option><option value="close_friends">Close Friends</option></select></label>
      <button className="primary-button" onClick={() => void postStory()}>Post for 24 hours</button>
    </section>

    <section className="tiger-card tiger-span-2">
      <h3>Current notes</h3>
      {stories.length === 0 ? <p>No active notes.</p> : <div className="tiger-story-grid">{stories.map((story) => <article key={story.id} className="tiger-story"><span className="tiger-story-emoji">{story.emoji}</span><div><strong>{story.profile?.display_name || story.profile?.username || (story.user_id === userId ? "You" : "Tiger user")}</strong><p>{story.body}</p><small>{story.audience === "close_friends" ? "Close Friends · " : ""}expires {new Date(story.expires_at).toLocaleString()}</small></div>{story.user_id === userId && <button className="secondary-button" onClick={() => void deleteStory(story.id)}>Delete</button>}</article>)}</div>}
    </section>
    {message && <p className="tiger-notice tiger-span-2">{message}</p>}
  </div>;
}
